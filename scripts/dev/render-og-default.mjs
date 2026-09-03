#!/usr/bin/env node
// Renders the static brand share card to public/og-default.png.
//
//   bun scripts/dev/render-og-default.mjs
//
// A real browser, not satori: this is the one card that must exist even when
// og-worker is down, so it is a committed file, and Chrome gives exact
// control over the pixel font at 1x. Fonts are inlined as data URIs because
// Chrome treats file:// origins as opaque and blocks file→file font loads.
//
// Re-run whenever the brand card changes; the PNG is what ships.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import puppeteer from "puppeteer-core";

const ROOT = resolve(import.meta.dirname, "../..");
const OUT = resolve(ROOT, "public/og-default.png");
const CHROME =
    process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const font = (file) =>
    `data:font/ttf;base64,${readFileSync(resolve(ROOT, "app/fonts", file)).toString("base64")}`;
const star = readFileSync(resolve(ROOT, "public/pinkstarlogo.svg"), "utf8");

const W = 1200;
const H = 630;

// Design: docs/share-cards-plan.md §4. Canvas #050505, a hairline panel with a
// 1px inset highlight, the star + pixel wordmark centred, tagline in
// pastelgray. No gradients, no gray/black shadows. The tint is a brand glow
// (box-shadow in the star's pink) — the only elevation the rules allow.
const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @font-face { font-family: "GeistPixel"; src: url("${font("GeistPixel-Triangle.ttf")}"); }
  @font-face { font-family: "Geist"; font-weight: 500; src: url("${font("Geist-Medium.ttf")}"); }
  @font-face { font-family: "Geist"; font-weight: 600; src: url("${font("Geist-SemiBold.ttf")}"); }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; background: #050505; overflow: hidden; }
  body { font-family: Geist, system-ui, sans-serif; color: #fff; -webkit-font-smoothing: antialiased; }
  .frame {
    position: absolute; inset: 32px; border-radius: 40px;
    background: #0a0a0a;
    border: 1px solid rgba(138,145,158,0.2);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .lockup { display: flex; align-items: center; gap: 36px; margin-top: -12px; }
  .star { width: 148px; height: 150px; filter: drop-shadow(0 0 48px rgba(252,224,203,0.28)); }
  .star svg { width: 100%; height: 100%; display: block; }
  .word { font-family: GeistPixel, Geist, monospace; font-size: 128px; line-height: 1; letter-spacing: -0.02em; }
  .tag { margin-top: 40px; font-size: 34px; font-weight: 500; color: #7F878E; letter-spacing: -0.01em; }
  .foot {
    position: absolute; left: 56px; right: 56px; bottom: 44px;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 24px; font-weight: 600; color: #7F878E;
  }
  .foot .chip {
    height: 44px; padding: 0 20px; border-radius: 999px;
    display: flex; align-items: center; gap: 10px;
    background: rgba(255,255,255,0.06); border: 1px solid rgba(138,145,158,0.2); color: #e7e9ea;
  }
  .live { width: 10px; height: 10px; border-radius: 999px; background: #FF746C; }
</style></head>
<body>
  <div class="frame">
    <div class="lockup">
      <div class="star">${star}</div>
      <div class="word">watchparty</div>
    </div>
    <div class="tag">magic internet money meets streaming</div>
    <div class="foot">
      <span>watchparty.xyz</span>
      <span class="chip"><span class="live"></span>live · coins · markets</span>
    </div>
  </div>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H } });
    mkdirSync(resolve(ROOT, "public"), { recursive: true });
    writeFileSync(OUT, png);
    console.log(`wrote ${OUT} (${(png.length / 1024).toFixed(1)} KB)`);
    if (png.length > 300 * 1024) {
        console.error("card is over 300 KB — WhatsApp starts dropping previews around there");
        process.exitCode = 1;
    }
} finally {
    await browser.close();
}
