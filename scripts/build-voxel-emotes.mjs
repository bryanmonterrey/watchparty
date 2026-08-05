// Generates watchparty's chat emote set as isometric voxel SVGs.
//
// Why generated rather than drawn or downloaded:
//
//   - BIAsia/voxel-icon's 30 "free animated icons" are 15 static objects in two
//     palettes (basket, toolbox, microscope...), 1254px opaque PNGs on #F4F4F4.
//     Wrong subjects for a chat, no alpha, and its licence forbids republishing
//     them "as part of another icon pack, asset library, template, or
//     generator" — which is what an emote picker is. Its SKILL.md is MIT, so
//     what's borrowed here is the STYLE (see references/style-spec.md), not art.
//   - SVG means these are a few hundred bytes each, scale to any size, recolour
//     from CSS, and can actually animate — the repo's animated loops are paid.
//
// Style rules taken from the spec: orthographic three-quarter isometric; one
// coarse base module; large rectilinear blocks merged into cuboids with no
// internal seams; crisp planar faces with no bevels; top face lightest and the
// two side faces stepped down (face-lit); sparse gaps to read as eyes/mouths;
// 12-30 visible blocks.
//
// Run: node scripts/build-voxel-emotes.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "public/emotes/voxel");

/** Projected size of one base module, in SVG units. */
const MODULE = 16;

/**
 * Depth foreshortening. The spec's camera is a true three-quarter isometric,
 * where both visible faces are 30-degree parallelograms and there is no frontal
 * plane at all. That is right for a 1254px editorial icon and wrong for a 22px
 * chat emote: rendered isometric, an eye or a mouth skews into an unreadable
 * notch — the first cut of this set was cubes with holes in them.
 *
 * So the camera is pulled around to face-on and depth runs up-and-right at this
 * fraction of a module. The construction grammar (one coarse base module, large
 * merged cuboids, crisp planar faces, face lighting, no bevels) is unchanged —
 * only the camera moves, and only because the output is thumbnail-sized by
 * definition.
 */
const DEPTH = 0.34;

/**
 * The near plane, in modules. Depth offset is measured BACK from here, so the
 * block nearest the camera sits flush and everything behind it steps up and to
 * the right. Without this the extrusion ran the other way and every head grew a
 * dark wedge out of its bottom-left corner.
 */
const NEAR = 7;

// Face shading. The spec calls for face lighting rather than edge lighting, so
// each face is one flat tone and the three tones ARE the form — there are no
// gradients, strokes or bevels anywhere in the output.
const FRONT = 1;
const TOP = 0.8;
const SIDE = 0.58;

/** Mixes a hex colour toward black by `k` (1 = unchanged). */
function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * k);
    const g = Math.round(((n >> 8) & 255) * k);
    const b = Math.round((n & 255) * k);
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Face-on, with everything behind the near plane stepping up and to the right. */
function project(x, y, z) {
    const back = (NEAR - z) * DEPTH;
    return [(x + back) * MODULE, (-y - back) * MODULE];
}

function poly(points, fill) {
    const d = points.map(([x, y, z]) => project(x, y, z).map((n) => n.toFixed(2)).join(",")).join(" ");
    return `<polygon points="${d}" fill="${fill}"/>`;
}

/**
 * One cuboid, as its three visible faces.
 *
 * Blocks are emitted in the order given and painted in that order — every
 * composition here is a slab followed by features sitting on its front plane,
 * so draw order is authored rather than sorted.
 */
function block({ x, y, z, w = 1, h = 1, d = 1, color }) {
    const [x1, y1, z1] = [x + w, y + h, z + d];
    // Back faces first, front last — the front plane is nearest the camera and
    // carries the recognition, so nothing may paint over it.
    return [
        poly([[x, y1, z], [x1, y1, z], [x1, y1, z1], [x, y1, z1]], shade(color, TOP)),
        poly([[x1, y, z], [x1, y1, z], [x1, y1, z1], [x1, y, z1]], shade(color, SIDE)),
        poly([[x, y, z1], [x, y1, z1], [x1, y1, z1], [x1, y, z1]], shade(color, FRONT)),
    ].join("");
}

// ---------------------------------------------------------------------------
// The set
// ---------------------------------------------------------------------------
//
// Faces are a 6x6x5 head slab with features protruding one module off the front
// plane (z = 5). Features are authored on a 6x6 front grid where row 0 is the
// TOP row, which is why `fy` flips it — reading the art in source should match
// what renders.

const HEAD_W = 6;
const HEAD_H = 6;
const HEAD_D = 5;

const INK = "#12131a";

/** Front-grid row/col → world y/x. Row 0 is the TOP row, so reading the art in
 *  source matches what renders. */
const fy = (row) => HEAD_H - 1 - row;

/** A feature block sitting on the head's front plane. */
function feat(col, row, w, h, color = INK) {
    return { x: col, y: fy(row + h - 1), z: HEAD_D, w, h, d: 1, color };
}

/**
 * An object drawn as art rather than placed by hand.
 *
 * Rows are read top-down, one character per module, "." for empty. Runs are
 * merged horizontally and then vertically into the largest cuboids that fit,
 * which is the spec's construction grammar — the output is a handful of big
 * blocks with no internal seams, not a tiled grid of cubes.
 *
 * The faces below don't use this: they're a slab plus a few raised features, and
 * raising them off the front plane is what gives an eye its shadow.
 */
function sprite(art, palette, depth = 4) {
    const h = art.length;
    const runs = [];
    art.forEach((row, r) => {
        let c = 0;
        while (c < row.length) {
            const ch = row[c];
            if (ch === ".") { c++; continue; }
            let len = 1;
            while (c + len < row.length && row[c + len] === ch) len++;
            runs.push({ r, c, len, ch });
            c += len;
        }
    });

    const blocks = [];
    const used = new Set();
    for (let i = 0; i < runs.length; i++) {
        if (used.has(i)) continue;
        const run = runs[i];
        let span = 1;
        // Grow downward while the row below has the identical run.
        for (;;) {
            const next = runs.findIndex((o, j) =>
                !used.has(j) && j > i && o.r === run.r + span && o.c === run.c && o.len === run.len && o.ch === run.ch);
            if (next === -1) break;
            used.add(next);
            span++;
        }
        blocks.push({
            x: run.c,
            y: h - run.r - span,
            z: 0,
            w: run.len,
            h: span,
            d: depth,
            color: palette[run.ch],
        });
    }
    return blocks;
}

/**
 * A face emote: the head, then its features.
 *
 * The head is three stacked slabs, not one cube. A flat 6x6 square has no
 * silhouette — every emote read as the same box wearing different marks, and at
 * 22px the silhouette is most of what you get before the marks resolve. Cutting
 * one module off each corner is the spec's "build curves as a few intentional
 * steps", at the coarsest step a 6-module span allows.
 */
function face(color, features) {
    return [
        { x: 1, y: HEAD_H - 1, z: 0, w: HEAD_W - 2, h: 1, d: HEAD_D, color },
        { x: 0, y: 1, z: 0, w: HEAD_W, h: HEAD_H - 2, d: HEAD_D, color },
        { x: 1, y: 0, z: 0, w: HEAD_W - 2, h: 1, d: HEAD_D, color },
        ...features,
    ];
}

const EMOTES = {
    // Six rows, top to bottom: forehead, brow, eye, gap, mouth, chin. What
    // survives at 22px is eye shape plus mouth shape, so each face differs in
    // BOTH rather than in some subtlety of one.

    // Small high eyes over a mouth wide open.
    lol: face("#7ee787", [
        feat(1, 1, 1, 1), feat(4, 1, 1, 1),
        feat(1, 3, 4, 2),
    ]),
    // Tall eyes, square mouth.
    shock: face("#ffd479", [
        feat(1, 1, 1, 2), feat(4, 1, 1, 2),
        feat(2, 4, 2, 1),
    ]),
    // Red tall eyes, wide smile.
    love: face("#ff9ec4", [
        feat(1, 1, 1, 2, "#e23e6b"), feat(4, 1, 1, 2, "#e23e6b"),
        feat(1, 4, 4, 1),
    ]),
    // Full-width visor, small mouth.
    cool: face("#c9a7ff", [
        feat(0, 2, 6, 1),
        feat(2, 4, 2, 1),
    ]),
    // Brows stepped inward-down. The step IS the anger — the spec forbids a
    // finer grid, so the diagonal is two blocks, not a slope.
    mad: face("#ff8f7a", [
        feat(1, 1, 1, 1), feat(2, 2, 1, 1),
        feat(4, 1, 1, 1), feat(3, 2, 1, 1),
        feat(1, 4, 4, 1),
    ]),
    // Small eyes, short mouth pushed low, one tear.
    sad: face("#8fb8ff", [
        feat(1, 2, 1, 1), feat(4, 2, 1, 1),
        feat(1, 3, 1, 1, "#3f7ae0"),
        feat(2, 4, 2, 1),
    ]),
    // One brow raised, mouth off centre.
    think: face("#9fe0d4", [
        feat(1, 1, 1, 1),
        feat(1, 2, 1, 1), feat(4, 2, 1, 1),
        feat(3, 4, 2, 1),
    ]),
    // X eyes: the two DIAGONALS of a 2x2. Filling all four cells (which the
    // first cut did) is a solid square, not a cross.
    dead: face("#b9c0d4", [
        feat(1, 1, 1, 1), feat(2, 2, 1, 1),
        feat(4, 1, 1, 1), feat(3, 2, 1, 1),
        feat(2, 4, 2, 1),
    ]),

    // Objects. Drawn as sprites — a silhouette is most of what an object emote
    // has to work with, and hand-placing cuboids kept producing boxes.
    // A flame needs a POINT and a lean — symmetrical and blunt-topped, it just
    // reads as a lump, which the first two cuts of this one did.
    fire: sprite([
        "....F...",
        "...FF...",
        "..FFF...",
        "..FFFF..",
        ".FFFFFF.",
        ".FFYYFF.",
        ".FYYYYF.",
        "..FYYF..",
    ], { F: "#ff7a3d", Y: "#ffd166" }),

    heart: sprite([
        ".HH..HH.",
        "HHHHHHHH",
        "HHHHHHHH",
        "HHHHHHHH",
        ".HHHHHH.",
        "..HHHH..",
        "...HH...",
    ], { H: "#ff5c8a" }),

    coin: sprite([
        "..CCCC..",
        ".CCCCCC.",
        "CCCCCCCC",
        "CCCDDCCC",
        "CCCDDCCC",
        "CCCCCCCC",
        ".CCCCCC.",
        "..CCCC..",
    ], { C: "#ffcc4d", D: "#c98f1e" }),

    gem: sprite([
        ".GGGGGG.",
        "GHHHHHHG",
        "GGGGGGGG",
        ".GGGGGG.",
        "..GGGG..",
        "...GG...",
    ], { G: "#3fd2c7", H: "#b6fff7" }),
};

// ---------------------------------------------------------------------------

function render(blocks) {
    // Measure the projection rather than assuming a box — objects and faces
    // have different spans and each should sit centred in its own square.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const b of blocks) {
        for (const dx of [0, b.w ?? 1]) {
            for (const dy of [0, b.h ?? 1]) {
                for (const dz of [0, b.d ?? 1]) {
                    const [px, py] = project(b.x + dx, b.y + dy, b.z + dz);
                    minX = Math.min(minX, px); maxX = Math.max(maxX, px);
                    minY = Math.min(minY, py); maxY = Math.max(maxY, py);
                }
            }
        }
    }
    const pad = MODULE * 0.35;
    const w = maxX - minX + pad * 2;
    const h = maxY - minY + pad * 2;
    const size = Math.max(w, h);
    const ox = -minX + pad + (size - w) / 2;
    const oy = -minY + pad + (size - h) / 2;

    const body = blocks.map(block).join("");
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size.toFixed(2)} ${size.toFixed(2)}"` +
        ` shape-rendering="crispEdges">` +
        `<g transform="translate(${ox.toFixed(2)} ${oy.toFixed(2)})">${body}</g></svg>`
    );
}

mkdirSync(OUT, { recursive: true });
let total = 0;
for (const [name, blocks] of Object.entries(EMOTES)) {
    const svg = render(blocks);
    writeFileSync(join(OUT, `${name}.svg`), svg);
    total += svg.length;
    console.log(`${name}.svg  ${blocks.length} blocks  ${svg.length}B`);
}
console.log(`\n${Object.keys(EMOTES).length} emotes, ${total}B total`);
