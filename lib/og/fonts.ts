import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FONT, PIXEL } from "./tokens";

// Read from disk rather than imported: the .ttf files ship with the /api/og
// function via outputFileTracingIncludes in next.config.ts. Loaded once per
// instance.
const dir = join(process.cwd(), "lib/og/fonts");
const load = (name: string) =>
    readFile(join(dir, name)).then((b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);

type Font = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600 | 700; style: "normal" };

let cached: Promise<Font[]> | null = null;

// Geist has no CJK/Arabic/Devanagari glyphs; add a Noto subset as a fallback
// entry here when that shows up (satori falls through by glyph).
export function fonts(): Promise<Font[]> {
    cached ??= Promise.all([
        load("Geist-Medium.ttf"),
        load("Geist-SemiBold.ttf"),
        load("Geist-Bold.ttf"),
        load("GeistPixel-Triangle.ttf"),
    ])
        .then(([medium, semibold, bold, pixel]): Font[] => [
            { name: FONT, data: medium, weight: 500, style: "normal" },
            { name: FONT, data: semibold, weight: 600, style: "normal" },
            { name: FONT, data: bold, weight: 700, style: "normal" },
            { name: PIXEL, data: pixel, weight: 400, style: "normal" },
        ])
        .catch((err) => {
            cached = null; // let the next request retry
            throw err;
        });
    return cached;
}
