// Is this File actually a video, going by its bytes rather than its name?
//
// 2026-09-04: a 9-byte file called "…(1).mp4" whose entire content was the
// text "Not Found" — a failed download saved under a video name — went
// through the create dialog, uploaded "successfully" (the bytes did arrive),
// and published as a video that could never play. The dialog trusted the
// extension. The container's magic bytes are the thing to trust.

export type SniffResult = { ok: true; container: "mp4" | "webm" | "mov" } | { ok: false; reason: string };

/** A real video is never this small; a failed download's error page always is. */
export const MIN_VIDEO_BYTES = 16 * 1024;

export function sniffVideoBytes(head: Uint8Array, size: number): SniffResult {
    if (size < MIN_VIDEO_BYTES) {
        const text = new TextDecoder().decode(head.subarray(0, 64)).replace(/[^\x20-\x7e]/g, "");
        return {
            ok: false,
            reason: `That file is only ${size} bytes${text ? ` ("${text.slice(0, 32)}")` : ""} — not a video. Re-download it and try again.`,
        };
    }
    // WebM/Matroska: EBML header.
    if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return { ok: true, container: "webm" };
    // ISO BMFF (MP4/MOV): a box type at bytes 4–8. `ftyp` is normal; the
    // others are what pre-ftyp QuickTime files start with.
    const box = String.fromCharCode(head[4], head[5], head[6], head[7]);
    if (box === "ftyp") return { ok: true, container: "mp4" };
    if (box === "moov" || box === "mdat" || box === "wide" || box === "free" || box === "skip") {
        return { ok: true, container: "mov" };
    }
    return { ok: false, reason: "That file doesn't look like a video (MP4, MOV or WebM). Re-download it and try again." };
}

export async function sniffVideoFile(file: Blob): Promise<SniffResult> {
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    return sniffVideoBytes(head, file.size);
}
