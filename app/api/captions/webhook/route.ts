import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/db";
import { videoCaptions } from "@/db/schema";
import { toVtt, langLabel } from "@/lib/captions/vtt";

// Port of sidebar's Deepgram captions webhook. The upload router points
// Deepgram's callback here; without it, VOD caption jobs complete into a 404.

// Deepgram pings the callback URL with GET before queuing the job
export function GET() {
    return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const postId = searchParams.get("postId");
    const userId = searchParams.get("userId");
    const langParam = searchParams.get("language"); // original requested lang or "auto"
    const secret = searchParams.get("secret");

    if (secret !== process.env.CAPTIONS_WEBHOOK_SECRET?.trim()) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!postId || !userId) {
        return NextResponse.json({ error: "Missing postId or userId" }, { status: 400 });
    }

    // Use arrayBuffer for reliable large-body parsing (Deepgram responses for long
    // videos can exceed 4MB, which req.json() may silently truncate on Vercel)
    const bodyBuffer = await req.arrayBuffer();
    const bodyText = new TextDecoder().decode(bodyBuffer);
    console.log("[captions-webhook] body size bytes:", bodyBuffer.byteLength, "for postId:", postId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let result: any;
    try {
        result = JSON.parse(bodyText);
    } catch (e) {
        console.error("[captions-webhook] JSON parse failed:", e, "body preview:", bodyText.slice(0, 200));
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    console.log("[captions-webhook] channels:", !!result?.results?.channels, "paragraphs:", !!result?.results?.channels?.[0]?.alternatives?.[0]?.paragraphs);

    const detectedLang = result?.results?.channels?.[0]?.detected_language;
    const inputLang = langParam && langParam !== "auto" ? langParam : undefined;
    const { vtt, language } = toVtt(result, detectedLang ?? inputLang);

    const cueCount = (vtt.match(/^\d+$/gm) ?? []).length;
    console.log("[captions-webhook] VTT cues:", cueCount, "VTT bytes:", vtt.length);

    if (vtt.trim() === "WEBVTT") {
        console.warn("[captions-webhook] Empty transcript for postId:", postId);
        return NextResponse.json({ ok: true, warning: "empty transcript" });
    }

    const admin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const vttPath = `${userId}/captions/${postId}-${language}.vtt`;
    const { error: uploadError } = await admin.storage
        .from("videos")
        .upload(vttPath, Buffer.from(vtt, "utf-8"), {
            contentType: "text/vtt",
            upsert: true,
        });

    if (uploadError) {
        console.error("[captions-webhook] Storage upload failed:", uploadError);
        return NextResponse.json({ error: "Storage error" }, { status: 500 });
    }

    const { data: { publicUrl } } = admin.storage.from("videos").getPublicUrl(vttPath);

    await db.insert(videoCaptions).values({
        postId,
        language,
        label: langLabel(language),
        url: publicUrl,
        isDefault: true,
    }).onConflictDoUpdate({
        target: [videoCaptions.postId, videoCaptions.language],
        set: { url: publicUrl, label: langLabel(language) },
    });

    console.log("[captions-webhook] saved caption for postId:", postId, "language:", language);
    return NextResponse.json({ ok: true, language });
}
