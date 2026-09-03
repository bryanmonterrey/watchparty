#!/usr/bin/env node
// Renders the app icon set from public/pinkstarlogo.svg:
//
//   public/icon-512.png   manifest + WalletConnect dapp metadata
//   public/icon-192.png   manifest + tab-badge base (lib/tab-badge/draw.ts)
//   app/apple-icon.png    iOS home screen (180, opaque)
//
//   bun scripts/dev/render-app-icons.mjs
//
// The star used to fill the canvas edge to edge on a transparent background,
// so every surface that crops or rounds an icon — Phantom's and MetaMask's
// circular dapp icons, Android's maskable mask, a cover-cropped hero — sliced
// its tips off. Now it sits at 60% of the canvas on the #050505 brand canvas,
// inside the 80% "safe zone" every masking convention keeps.
//
// Corners: the PNGs are SQUARE with the dark fill to the edge. iOS, Android
// and the wallets apply their own mask; baking rounded corners in leaves
// transparent notches showing through theirs. app/icon.svg (the tab favicon)
// is the one place we round ourselves, since a tab applies no mask.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = resolve(import.meta.dirname, "../..");
const CHROME =
    process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const star = readFileSync(resolve(ROOT, "public/pinkstarlogo.svg"), "utf8");

const TARGETS = [
    { out: "public/icon-512.png", size: 512 },
    { out: "public/icon-192.png", size: 192 },
    { out: "app/apple-icon.png", size: 180 },
];

const STAR_FRACTION = 0.6;

const html = (size) => `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; }
  html, body { width: ${size}px; height: ${size}px; background: #050505; overflow: hidden; }
  .star { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: ${Math.round(size * STAR_FRACTION)}px; }
  .star svg { width: 100%; height: auto; display: block; }
</style></head><body><div class="star">${star}</div></body></html>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
    const page = await browser.newPage();
    for (const t of TARGETS) {
        await page.setViewport({ width: t.size, height: t.size, deviceScaleFactor: 1 });
        await page.setContent(html(t.size), { waitUntil: "load" });
        const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: t.size, height: t.size } });
        writeFileSync(resolve(ROOT, t.out), png);
        console.log(`wrote ${t.out} (${t.size}px, ${(png.length / 1024).toFixed(1)} KB)`);
    }
} finally {
    await browser.close();
}
