// Redraws the badge glyphs as pixel art.
//
// The originals are Microsoft Fluent Emoji (Flat), vendored in public/badges/ —
// smooth vector art that reads as "an emoji someone dropped in" next to
// watchparty's font-pixel display face. This rasterises each one onto a coarse
// grid and re-emits it as an SVG of flat squares, so the result is still vector
// (scales to any size, no asset per density) but is genuinely pixelated rather
// than a smooth shape with a filter over it.
//
// The output is deliberately NOT a PNG at 16px. A chat line renders these at
// 14px and the profile strip at 32px, and a raster would be soft at one of the
// two; squares in an SVG are exact at both.
//
// Run: node scripts/build-pixel-badges.mjs

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const SRC = join(process.cwd(), "public/badges");
const OUT = join(SRC, "pixel");

/**
 * Grid resolution. 16 is the classic sprite size and still resolves a rocket, a
 * trophy and a bullseye as distinct silhouettes; 12 loses the trophy's handles
 * and 24 stops reading as pixel art at 14px.
 */
const GRID = 16;

/** Alpha below this is background. Anti-aliased edges land under it and drop. */
const ALPHA_CUTOFF = 128;

/**
 * Colour quantisation step. Downsampling a smooth gradient leaves dozens of
 * near-identical tones, which looks like a blurry photo of pixel art rather
 * than pixel art — snapping to a ramp is what restores the flat blocks. Kept
 * fine now that sampling (below) does most of the flattening.
 */
const STEP = 16;

const snap = (v) => Math.min(255, Math.round(v / STEP) * STEP);

async function pixelize(file) {
    // Rasterise large first, then box down: sampling the vector directly at
    // 16px gives whatever the renderer's hinting decides, and detail drops out
    // unpredictably per glyph.
    const big = await sharp(readFileSync(file), { density: 384 })
        .resize(256, 256, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

    // NEAREST, not an averaging kernel. Averaging mixes each cell with the
    // transparent pixels around it, and since those carry no meaningful colour
    // the result drifts toward grey — the first cut of this came out visibly
    // desaturated against the originals. Sampling takes one real pixel per
    // cell, so every colour in the output is a colour that was in the artwork.
    const { data } = await sharp(big)
        .resize(GRID, GRID, { fit: "fill", kernel: "nearest" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    // Group same-coloured cells per row into one rect — a 16x16 grid is 256
    // rects unmerged, and most glyphs have long flat runs.
    const rects = [];
    for (let y = 0; y < GRID; y++) {
        let run = null;
        for (let x = 0; x <= GRID; x++) {
            const i = (y * GRID + x) * 4;
            const solid = x < GRID && data[i + 3] >= ALPHA_CUTOFF;
            const fill = solid
                ? `#${[snap(data[i]), snap(data[i + 1]), snap(data[i + 2])]
                    .map((c) => c.toString(16).padStart(2, "0")).join("")}`
                : null;

            if (run && run.fill === fill) {
                run.w++;
                continue;
            }
            if (run) rects.push(run);
            run = fill ? { x, y, w: 1, fill } : null;
        }
        if (run) rects.push(run);
    }

    const body = rects
        .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="1" fill="${r.fill}"/>`)
        .join("");

    // width/height as well as viewBox, matching the Fluent originals: an SVG
    // with no intrinsic size can collapse when loaded through <img>, and these
    // are rendered that way.
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${GRID}" height="${GRID}"`
        + ` viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges">${body}</svg>`;
}

mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((f) => f.endsWith(".svg"));
let bytes = 0;

for (const file of files) {
    const svg = await pixelize(join(SRC, file));
    writeFileSync(join(OUT, file), svg);
    bytes += svg.length;
    console.log(`${file}  ${svg.length}B`);
}

console.log(`\n${files.length} badges, ${(bytes / 1024).toFixed(1)}KB total`);
