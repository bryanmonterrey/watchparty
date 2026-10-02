#!/usr/bin/env bun
/**
 * Replace black / missing thumbnails on video posts with a real frame.
 *
 *   bun scripts/dev/backfill-video-thumbnails.ts            # dry run: report only
 *   bun scripts/dev/backfill-video-thumbnails.ts --apply    # upload + update posts
 *
 * Why it exists (2026-10-02): the upload dialog captured ONE frame at
 * min(15% of the video, 5s) and never looked at it. Music videos open on
 * black or a fade-in, so that frame was a black JPEG — 7 of 65 posts were
 * pure black (five of them the byte-identical 15 KB image), a few more nearly
 * so, and 4 had no thumbnail at all because the capture never ran. The dialog
 * is fixed to pick a lit frame; this repairs what was already uploaded.
 *
 * It measures before it touches anything: a thumbnail is only replaced when it
 * is missing or dark AND the video has a clearly better frame. A video that is
 * dark all the way through (audio over a black card) is left alone — there is
 * nothing better to show, and a second black JPEG is not a fix.
 *
 * Needs ffmpeg/ffprobe on PATH. Reads the video over HTTP with -ss before -i,
 * so each sample is a range request, not a download. Writes go to whatever
 * project .env resolves to (supabase-js storage + drizzle) — production on this
 * machine; serviceClient() refuses if the two disagree.
 */
import { execFile } from "node:child_process";
import { db } from "@/db";
import { posts } from "@/db/schema";
import { desc, eq, isNotNull } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

// Mean luma (0-255) below this reads as black in a 125px rail tile.
const DARK_MEAN = 20;
// A replacement has to be lit, and meaningfully better than what is there.
const MIN_GOOD_MEAN = 28;
const MIN_GAIN = 14;
const SAMPLE_AT = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];

type Stats = { mean: number; std: number };

function stats(buf: ArrayBuffer): Stats {
    const b = new Uint8Array(buf);
    let sum = 0;
    for (const v of b) sum += v;
    const mean = sum / b.length;
    let sq = 0;
    for (const v of b) sq += (v - mean) ** 2;
    return { mean, std: Math.sqrt(sq / b.length) };
}

const GRAY = "scale=64:36,format=gray";

// execFile, not a shell: URLs go straight to argv. null on any failure — every
// caller treats "couldn't read it" as a result, not an exception.
function run(cmd: string, args: string[]): Promise<Buffer | null> {
    return new Promise((resolve) => {
        execFile(cmd, args, { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, timeout: 120_000 }, (err, stdout) =>
            resolve(err ? null : stdout),
        );
    });
}
const bytes = (b: Buffer) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

async function imageStats(url: string): Promise<Stats | null> {
    const out = await run("ffmpeg", ["-v", "error", "-i", url, "-vf", GRAY, "-frames:v", "1", "-f", "rawvideo", "-"]);
    return out && out.byteLength ? stats(bytes(out)) : null;
}

async function frameStats(url: string, t: number): Promise<Stats | null> {
    const out = await run("ffmpeg", ["-v", "error", "-ss", t.toFixed(2), "-i", url, "-vf", GRAY, "-frames:v", "1", "-f", "rawvideo", "-"]);
    return out && out.byteLength ? stats(bytes(out)) : null;
}

async function duration(url: string): Promise<number> {
    const out = await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", url]);
    const d = Number(out?.toString().trim());
    return Number.isFinite(d) && d > 0 ? d : 0;
}

const rows = await db
    .select({ id: posts.id, userId: posts.userId, title: posts.title, videoUrl: posts.videoUrl, thumbnailUrl: posts.thumbnailUrl })
    .from(posts)
    .where(isNotNull(posts.videoUrl))
    .orderBy(desc(posts.createdAt));

console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${rows.length} video posts`);

let fixed = 0, skipped = 0, failed = 0;
for (const p of rows) {
    const label = `${p.id} ${JSON.stringify((p.title ?? "").slice(0, 36))}`;
    const current = p.thumbnailUrl ? await imageStats(p.thumbnailUrl) : null;
    if (p.thumbnailUrl && !current) { console.log(`  ?     ${label} — thumbnail unreadable, treating as missing`); }
    if (current && current.mean >= DARK_MEAN) continue; // fine as it is

    const d = await duration(p.videoUrl!);
    if (!d) { console.log(`  FAIL  ${label} — could not read the video`); failed++; continue; }

    let best: { t: number; s: Stats } | null = null;
    for (const f of SAMPLE_AT) {
        const t = d * f;
        const s = await frameStats(p.videoUrl!, t);
        if (!s || s.mean < MIN_GOOD_MEAN) continue;
        // Contrast picks a frame with something IN it over a flat bright card.
        if (!best || s.std > best.s.std) best = { t, s };
    }
    const base = current?.mean ?? 0;
    if (!best || best.s.mean < base + MIN_GAIN) {
        console.log(`  skip  ${label} — no better frame (now ${base.toFixed(0)}, video is dark throughout)`);
        skipped++;
        continue;
    }
    console.log(`  fix   ${label} — ${p.thumbnailUrl ? `luma ${base.toFixed(0)}` : "no thumbnail"} -> frame at ${best.t.toFixed(0)}s (luma ${best.s.mean.toFixed(0)}, contrast ${best.s.std.toFixed(0)})`);
    fixed++;
    if (!APPLY) continue;

    const jpeg = await run("ffmpeg", ["-v", "error", "-ss", best.t.toFixed(2), "-i", p.videoUrl!, "-frames:v", "1", "-vf", "scale=min(1280\\,iw):-2", "-q:v", "3", "-f", "image2", "-c:v", "mjpeg", "-"]);
    if (!jpeg || !jpeg.byteLength) { console.log(`        ✗ frame extraction failed`); failed++; fixed--; continue; }

    const { serviceClient } = await import("@/lib/supabase/service-client");
    const supabase = serviceClient();
    // Same `<userId>/…` layout upload.getPresignedUrl writes.
    const path = `${p.userId}/backfill-${p.id}-${Date.now()}.jpg`;
    const up = await supabase.storage.from("thumbnails").upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
    if (up.error) { console.log(`        ✗ upload failed: ${up.error.message}`); failed++; fixed--; continue; }
    const url = supabase.storage.from("thumbnails").getPublicUrl(path).data.publicUrl;
    await db.update(posts).set({ thumbnailUrl: url }).where(eq(posts.id, p.id));
    console.log(`        ✓ ${url.replace(/^https?:\/\/[^/]+/, "")}`);
}

console.log(`${APPLY ? "replaced" : "would replace"} ${fixed} | left alone (dark video) ${skipped} | failed ${failed}`);
process.exit(failed ? 1 : 0);
