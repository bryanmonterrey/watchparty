// Turns BIAsia/voxel-icon's free pack into chat-sized emotes.
//
// The upstream files can't be used as shipped. Each is a 1254px OPAQUE RGB PNG
// on a flat #F4F4F4 field, ~420KB — on the near-black chat rail that renders as
// a white tile with an icon in it, and fifteen of them is 6.3MB of emote art.
//
// So this does two things:
//
//   1. Cuts the background to alpha by flood-filling inward from the border.
//      NOT a colour threshold: several subjects have genuinely white or
//      near-white parts (the headphones, the mailbox flag, the floppy label),
//      and a threshold punches holes straight through them. Only background
//      that is REACHABLE from the edge is cleared, which is the same rule the
//      pack's own normalize-gray-background.py uses.
//   2. Trims the dead margin and writes 112px webp — big enough for the
//      picker's 32px cell on a 3x display, ~2-4KB each.
//
// Licence: the icons are free for commercial use, but their LICENSE.md forbids
// republishing them "as part of another icon pack, asset library, template, or
// generator". Shipping them as this app's browsable emote set is close enough
// to that line to be worth knowing about; it's a deliberate, owner-made call
// (2026-08-04) and the terms are recorded in public/emotes/pack/NOTICE.md.
//
// Run: node scripts/build-emote-pack.mjs [path-to-voxel-icon-checkout]

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";

const REPO = "https://github.com/BIAsia/voxel-icon.git";
const OUT = join(process.cwd(), "public/emotes/pack");

/** Upstream filename → the code people actually type. */
const CODES = {
    basket: "basket",
    brick: "brick",
    "floppy-disk": "floppy",
    "gem-stone": "gemstone",
    headphones: "headphones",
    hourglass: "hourglass",
    locked: "lock",
    "mailbox-with-raised-flag": "mailbox",
    microscope: "microscope",
    pencil: "pencil",
    scissors: "scissors",
    "shopping-cart": "cart",
    "teddy-bear": "teddy",
    telescope: "telescope",
    toolbox: "toolbox",
};

/** How far a pixel may drift from #F4F4F4 and still count as background. */
const BG_TOLERANCE = 14;

const SIZE = 112;

function source() {
    const given = process.argv[2];
    if (given && existsSync(given)) return given;
    const dir = join(tmpdir(), "voxel-icon-src");
    if (!existsSync(dir)) {
        console.log("cloning voxel-icon…");
        execFileSync("git", ["clone", "--depth", "1", "-q", REPO, dir], { stdio: "inherit" });
    }
    return dir;
}

/**
 * Clears border-connected background to alpha 0.
 *
 * Iterative flood fill over a flat Uint8 buffer — 1254² is 1.5M pixels and a
 * recursive fill blows the stack well before it finishes one icon.
 */
async function cutBackground(file) {
    const { data, info } = await sharp(file)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { width: w, height: h, channels: ch } = info;
    const seen = new Uint8Array(w * h);
    const stack = [];

    const isBg = (i) => {
        const p = i * ch;
        return (
            Math.abs(data[p] - 244) <= BG_TOLERANCE &&
            Math.abs(data[p + 1] - 244) <= BG_TOLERANCE &&
            Math.abs(data[p + 2] - 244) <= BG_TOLERANCE
        );
    };

    const push = (i) => {
        if (seen[i] || !isBg(i)) return;
        seen[i] = 1;
        stack.push(i);
    };

    for (let x = 0; x < w; x++) {
        push(x);
        push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
        push(y * w);
        push(y * w + w - 1);
    }

    while (stack.length) {
        const i = stack.pop();
        data[i * ch + 3] = 0;
        const x = i % w;
        const y = (i - x) / w;
        if (x > 0) push(i - 1);
        if (x < w - 1) push(i + 1);
        if (y > 0) push(i - w);
        if (y < h - 1) push(i + w);
    }

    return sharp(data, { raw: { width: w, height: h, channels: ch } })
        .trim({ threshold: 0 })
        .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90, effort: 6 })
        .toBuffer();
}

const src = join(source(), "icons/native");
mkdirSync(OUT, { recursive: true });

const files = readdirSync(src).filter((f) => f.endsWith(".png"));
let bytes = 0;

for (const file of files) {
    const stem = file.replace(/\.png$/, "");
    const code = CODES[stem];
    if (!code) {
        console.warn(`skipping ${stem} — no code mapped`);
        continue;
    }
    const buf = await cutBackground(join(src, file));
    writeFileSync(join(OUT, `${code}.webp`), buf);
    bytes += buf.length;
    console.log(`${code}.webp  ${(buf.length / 1024).toFixed(1)}KB`);
}

writeFileSync(
    join(OUT, "NOTICE.md"),
    `# Third-party emote art

These files are derived from the free pack in [BIAsia/voxel-icon](https://github.com/BIAsia/voxel-icon)
(15 subjects, \`icons/native\`). They have been background-cut to alpha, trimmed
and resized to ${SIZE}px webp by \`scripts/build-emote-pack.mjs\`; the artwork is
otherwise unmodified.

Upstream terms (LICENSE.md), verbatim:

> The 30 icons under \`icons/\` are free for unlimited personal and commercial
> projects. Attribution is not required. You may modify, crop, recolor, or
> composite them.
>
> You may not resell, redistribute, or republish the icon files themselves —
> original or modified — on their own or as part of another icon pack, asset
> library, template, or generator.

Retained here so the provenance and the terms travel with the files.
`,
);

console.log(`\n${files.length} icons, ${(bytes / 1024).toFixed(0)}KB total`);
