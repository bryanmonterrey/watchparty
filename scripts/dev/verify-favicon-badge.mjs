// Runs the REAL lib/tab-badge/draw.ts in a real Chrome and asserts the output
// is a badged icon — different from the base, and actually red where the badge
// goes, with white ink on it.
//
// This exists because the first version of the tab badge shipped unverified and
// drew nothing: tsc, the tests and the repo guards all passed while the feature
// did not work. Canvas behaviour (roundRect, compositing, toDataURL) is only
// observable in a browser.
//
// Run: node scripts/dev/verify-favicon-badge.mjs

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const CHROME =
    process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// bun transpiles the real module to browser JS, so the thing under test is the
// shipped source and not a hand-copied duplicate that can drift.
const js = execSync("bun build lib/tab-badge/draw.ts --format=esm", { encoding: "utf8" });
const iconB64 = readFileSync("public/icon-192.png").toString("base64");

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><body></body>");

    const results = await page.evaluate(
        async (js, iconB64) => {
            const mod = await import(`data:text/javascript;base64,${btoa(js)}`);
            const BASE = `data:image/png;base64,${iconB64}`;
            const out = {};

            for (const count of [1, 12, 506, 1500]) {
                const url = await mod.drawFaviconBadge(count, BASE);
                if (!url) { out[count] = { ok: false, why: "returned null" }; continue; }

                const img = new Image();
                await new Promise((r) => { img.onload = r; img.onerror = r; img.src = url; });
                const c = document.createElement("canvas");
                c.width = c.height = 64;
                const ctx = c.getContext("2d");
                ctx.drawImage(img, 0, 0);
                const { data } = ctx.getImageData(0, 0, 64, 64);

                let red = 0;
                let ink = 0;
                let minX = 64, maxX = -1, minY = 64, maxY = -1;
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
                    if (a > 200 && r > 200 && g < 90 && b < 90) {
                        red++;
                        const px = (i / 4) % 64;
                        const py = Math.floor(i / 4 / 64);
                        if (px < minX) minX = px;
                        if (px > maxX) maxX = px;
                        if (py < minY) minY = py;
                        if (py > maxY) maxY = py;
                    }
                    if (a > 200 && r > 240 && g > 240 && b > 240) ink++;
                }
                // The badge is centred on the horizontal axis and anchored to
                // the bottom, so its red span should straddle x=32 and reach
                // the lower edge. Counting red pixels alone can't see either.
                const centreX = (minX + maxX) / 2;
                const centred = Math.abs(centreX - 32) <= 2;
                const bottomAnchored = maxY >= 60;
                out[count] = {
                    ok: url.startsWith("data:image/png") && red > 100 && ink > 20 && centred && bottomAnchored,
                    label: mod.badgeText(count),
                    redPixels: red,
                    inkPixels: ink,
                    centreX,
                    centred,
                    bottomAnchored,
                    bounds: { minX, maxX, minY, maxY },
                };
            }
            return out;
        },
        js,
        iconB64,
    );

    console.log(JSON.stringify(results, null, 2));
    const bad = Object.entries(results).filter(([, v]) => !v.ok);
    if (bad.length) {
        console.error("\nFAIL — badge missing or not red:", bad.map(([k]) => k).join(", "));
        process.exit(1);
    }
    console.log("\nPASS — badge drawn, red, and legible at every count");
} finally {
    await browser.close();
}
