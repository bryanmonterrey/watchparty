/**
 * Does snapshot painting actually paint?
 *
 * Runs against PRODUCTION, signed out, on `/feed` — public under
 * `PUBLIC_BROWSING`, and the surface the feature exists for.
 *
 *   node scripts/dev/browser-smoke-snapshot.mjs [--headed]
 *
 * The claim worth testing isn't "the code ran" (tsc covers that) but the one
 * the feature makes: on a SECOND visit, posts are on screen before the network
 * answers. So visit 2 BLOCKS the feed request outright and asserts posts render
 * anyway. Without a working snapshot that load can only show skeletons.
 *
 * Counting `<article>` is deliberate: `PostCardSkeleton` renders a `<div>`, so
 * a skeleton can never be mistaken for a painted post. An earlier version of
 * this file counted `<tr>` on a `/trending` route that does not exist — a test
 * that would have passed by asserting nothing.
 *
 * Asserts:
 *   - visit 1 writes a `watchparty.snap.*` entry
 *   - the payload carries superjson type metadata (Dates round-trip as Dates)
 *   - visit 2 renders posts with the feed request BLOCKED  ← the feature
 *   - a backdated snapshot is REFUSED, not painted        ← the safety valve
 */

import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.env.SMOKE_BASE ?? "https://watchparty.xyz";
const HEADED = process.argv.includes("--headed");
const OUT = ".smoke";
const CHROME =
    process.env.CHROME_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const ROUTE = "/feed";
/** tRPC batches, so this substring also catches the batch it rides in. */
const DATA_CALL = "getFeed";

mkdirSync(OUT, { recursive: true });

const ok = [];
const fail = [];
const check = (cond, msg) => (cond ? ok : fail).push(msg);

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: HEADED ? false : "new",
    args: ["--no-sandbox"],
});

try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

    // ── Visit 1: cold, populates the snapshot ───────────────────────────────
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "networkidle2", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 4_000)); // writes are debounced 1s

    const first = await page.evaluate(() => {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith("watchparty.snap.")) keys.push(k);
        }
        // PostCardSkeleton is a <div>; only a real card is an <article>.
        return { keys, posts: document.querySelectorAll("article").length };
    });

    check(first.posts > 0, `visit 1 rendered ${first.posts} posts (baseline)`);
    check(first.keys.length > 0, `visit 1 wrote a snapshot: ${first.keys.join(", ") || "NONE"}`);

    // superjson, not JSON. This is the failure that renders "Invalid Date"
    // rather than throwing, so nothing else would catch it.
    const superjsonOk = await page.evaluate((keys) => {
        const feedKey = keys.find((k) => k.includes("feed")) ?? keys[0];
        if (!feedKey) return null;
        const raw = localStorage.getItem(feedKey);
        return /"meta"\s*:/.test(raw) && /"Date"/.test(raw);
    }, first.keys);
    check(superjsonOk === true, "stored payload carries superjson Date metadata");

    // ── Visit 2: feed request blocked. Only a snapshot can paint. ───────────
    await page.setRequestInterception(true);
    let blocked = 0;
    page.on("request", (req) => {
        if (req.url().includes(DATA_CALL)) {
            blocked++;
            return req.abort();
        }
        req.continue();
    });

    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 5_000));

    const painted = await page.evaluate(() => document.querySelectorAll("article").length);
    check(blocked > 0, `visit 2 blocked ${blocked} ${DATA_CALL} request(s)`);
    check(painted > 0, `visit 2 painted ${painted} posts with the feed request BLOCKED — the feature`);
    await page.screenshot({ path: `${OUT}/snapshot-painted.png` });

    // ── A backdated snapshot must be refused ────────────────────────────────
    // The guard that stops old data being presented as current.
    await page.evaluate(() => {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k?.startsWith("watchparty.snap.")) continue;
            const raw = localStorage.getItem(k);
            localStorage.setItem(
                k,
                raw.replace(/"savedAt":\d+/, `"savedAt":${Date.now() - 30 * 24 * 3600 * 1000}`),
            );
        }
    });

    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 5_000));

    const stale = await page.evaluate(() => document.querySelectorAll("article").length);
    check(stale === 0, `a 30-day-old snapshot is refused, not painted (posts=${stale})`);
    await page.screenshot({ path: `${OUT}/snapshot-stale-refused.png` });
} finally {
    await browser.close();
}

for (const m of ok) console.log(`  ok    ${m}`);
for (const m of fail) console.log(`  FAIL  ${m}`);
console.log(`\n${ok.length} passed, ${fail.length} failed. Screenshots in ${OUT}/`);
process.exit(fail.length ? 1 : 0);
