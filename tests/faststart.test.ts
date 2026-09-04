import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { faststart, readTopLevelAtoms } from "@/lib/video/faststart";

/**
 * tests/fixtures/moov-at-end.mp4: 0.5s of ffmpeg testsrc + a sine, written the
 * way downloaders write it — ftyp, free, mdat, moov. 3.3 KB.
 */
const FIXTURE = new Blob([readFileSync("tests/fixtures/moov-at-end.mp4")], { type: "video/mp4" });

function u8(view: DataView, at: number, n: number): number[] {
    return Array.from({ length: n }, (_, i) => view.getUint8(at + i));
}

/** Every chunk offset in a moov buffer, in atom order (stco 32-bit, co64 64-bit). */
function chunkOffsets(moov: DataView): number[] {
    const out: number[] = [];
    const walk = (start: number, end: number) => {
        let o = start;
        while (o + 8 <= end) {
            const size = moov.getUint32(o) || end - o;
            const type = String.fromCharCode(...u8(moov, o + 4, 4));
            if (["moov", "trak", "mdia", "minf", "stbl"].includes(type)) walk(o + 8, o + size);
            if (type === "stco" || type === "co64") {
                const count = moov.getUint32(o + 12);
                for (let i = 0; i < count; i++) {
                    out.push(type === "stco" ? moov.getUint32(o + 16 + i * 4) : Number(moov.getBigUint64(o + 16 + i * 8)));
                }
            }
            o += size;
        }
    };
    walk(0, moov.byteLength);
    return out;
}

describe("faststart", () => {
    test("the fixture really has moov after mdat", async () => {
        const atoms = (await readTopLevelAtoms(FIXTURE))!;
        expect(atoms.map((a) => a.type)).toEqual(["ftyp", "free", "mdat", "moov"]);
    });

    test("moves moov ahead of mdat without changing the size", async () => {
        const out = await faststart(FIXTURE);
        expect(out).not.toBe(FIXTURE);
        expect(out.size).toBe(FIXTURE.size);
        const atoms = (await readTopLevelAtoms(out))!;
        expect(atoms.map((a) => a.type)).toEqual(["ftyp", "free", "moov", "mdat"]);
    });

    test("every chunk offset still points at the same media bytes", async () => {
        const inAtoms = (await readTopLevelAtoms(FIXTURE))!;
        const inMoov = inAtoms.find((a) => a.type === "moov")!;
        const before = new DataView(await FIXTURE.slice(inMoov.offset, inMoov.offset + inMoov.size).arrayBuffer());
        const out = await faststart(FIXTURE);
        const outAtoms = (await readTopLevelAtoms(out))!;
        const outMoov = outAtoms.find((a) => a.type === "moov")!;
        const after = new DataView(await out.slice(outMoov.offset, outMoov.offset + outMoov.size).arrayBuffer());
        const a = chunkOffsets(before);
        const b = chunkOffsets(after);
        expect(a.length).toBeGreaterThan(0);
        expect(b.length).toBe(a.length);
        const src = new DataView(await FIXTURE.arrayBuffer());
        const dst = new DataView(await out.arrayBuffer());
        for (let i = 0; i < a.length; i++) {
            expect(b[i] - a[i]).toBe(inMoov.size);
            expect(u8(dst, b[i], 16)).toEqual(u8(src, a[i], 16));
        }
    });

    test("is idempotent: an already-faststart file comes back as itself", async () => {
        const once = await faststart(FIXTURE);
        const twice = await faststart(once);
        expect(twice).toBe(once);
    });

    test("leaves anything that is not an MP4 alone", async () => {
        const junk = new Blob(["Not Found"], { type: "video/mp4" });
        expect(await faststart(junk)).toBe(junk);
        const html = new Blob(["<html>hello</html>".repeat(10)], { type: "text/html" });
        expect(await faststart(html)).toBe(html);
    });
});
