import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { MIN_VIDEO_BYTES, sniffVideoBytes, sniffVideoFile } from "@/lib/video/sniff";

describe("sniffVideoBytes", () => {
    test("the 2026-09-04 file: 9 bytes of 'Not Found' named .mp4", () => {
        const r = sniffVideoBytes(new TextEncoder().encode("Not Found"), 9);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toContain("9 bytes");
        if (!r.ok) expect(r.reason).toContain("Not Found");
    });

    test("a real ffmpeg MP4 passes (size checked separately from the fixture's own tiny size)", async () => {
        const head = new Uint8Array(readFileSync("tests/fixtures/moov-at-end.mp4").subarray(0, 64));
        expect(sniffVideoBytes(head, MIN_VIDEO_BYTES)).toEqual({ ok: true, container: "mp4" });
    });

    test("the fixture itself is below the size floor and says so", async () => {
        const blob = new Blob([readFileSync("tests/fixtures/moov-at-end.mp4")]);
        const r = await sniffVideoFile(blob);
        expect(r.ok).toBe(false);
    });

    test("webm by EBML magic", () => {
        const head = new Uint8Array(64);
        head.set([0x1a, 0x45, 0xdf, 0xa3]);
        expect(sniffVideoBytes(head, MIN_VIDEO_BYTES)).toEqual({ ok: true, container: "webm" });
    });

    test("an HTML page saved as .mp4 is rejected even when it is big", () => {
        const head = new TextEncoder().encode("<!doctype html><html><head><title>Not Found</title></head>".padEnd(64, " "));
        const r = sniffVideoBytes(head, 200 * 1024);
        expect(r.ok).toBe(false);
    });
});
