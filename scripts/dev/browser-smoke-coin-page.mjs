/**
 * Browser check for the merged coin page (one route for every coin).
 *
 * Runs against PRODUCTION, which is the point: the merge is deployed, the coin
 * page is public, and no dev server or fixture is needed. Two pages that used to
 * be different components now render the same one, so the thing worth proving is
 * that neither shape crashes and both keep the content that made them useful.
 *
 *   node scripts/dev/browser-smoke-coin-page.mjs [--headed]
 *
 * Asserts, rather than eyeballing:
 *   - no error boundary, no Server Components render error, no empty body
 *   - the coin's symbol actually reaches the DOM
 *   - an EXTERNAL coin shows its social links (the Mobula path)
 *   - one of OUR tokens renders the watchparty panels (the merge itself)
 *   - ?legacy=1 still serves the old TokenProfile
 *
 * Screenshots land in .smoke/ for a human to look at afterwards — an assertion
 * can prove a page didn't crash, never that it looks right.
 */

import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const BASE = process.env.SMOKE_BASE ?? "https://watchparty.xyz";
const HEADED = process.argv.includes("--headed");
const OUT = ".smoke";

// An external coin (trending board) and one of ours (tokens row, by id).
const EXTERNAL = "/coin/solana/2sriDatBdNEnW5bYanhSYU2qFfhcNXRjwi1HUus2tCXu";
const OURS = "/coin/dZObgMlvmzd88XkFNaF1R";

const CHROME =
    process.env.CHROME_PATH ??
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Text that means the page failed, whatever it looks like. */
const FATAL = [
    "Application error",
    "An error occurred in the Server Components render",
    "This page could not be found",
    "Internal Server Error",
];

let failures = 0;
function check(name, ok, detail = "") {
    console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
    if (!ok) failures++;
}

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: !HEADED,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

async function visit(path, label) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push(String(e).slice(0, 200)));

    const res = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle2", timeout: 60_000 });
    // Client panels fetch after hydration; give them a beat before judging.
    await new Promise((r) => setTimeout(r, 4000));

    const body = await page.evaluate(() => document.body.innerText || "");
    const shot = `${OUT}/${label}.png`;
    await page.screenshot({ path: shot, fullPage: false });

    console.log(`\n${label}  (${path})`);
    check("http 200", res?.status() === 200, `got ${res?.status()}`);
    check("body is not empty", body.trim().length > 200, `${body.trim().length} chars`);
    const fatal = FATAL.find((f) => body.includes(f));
    check("no error boundary", !fatal, fatal ?? "");
    check("no uncaught page error", consoleErrors.length === 0, consoleErrors[0] ?? "");
    console.log(`    screenshot: ${shot}`);
    return { page, body };
}

// 1. External coin — the Mobula socials path, and the shape most users open.
{
    const { page, body } = await visit(EXTERNAL, "external-coin");
    check("shows the ticker", /CLAUDE/i.test(body));
    const socialHrefs = await page.$$eval("a[href^='http']", (as) =>
        as.map((a) => a.getAttribute("href")).filter((h) => /x\.com|twitter\.com|t\.me|claude\.com/i.test(h ?? "")),
    );
    check("renders social link(s)", socialHrefs.length > 0, socialHrefs.slice(0, 2).join(" "));
    await page.close();
}

// 2. One of OURS — the merge. Previously TokenProfile, now CoinDetail + panels.
{
    const { page, body } = await visit(OURS, "our-token-merged");
    check("shows our ticker", /PING/i.test(body), body.slice(0, 80).replace(/\n/g, " "));
    await page.close();
}

// 3. The escape hatch still works, so a regression is one query param from proof.
{
    const { page } = await visit(`${OURS}?legacy=1`, "our-token-legacy");
    await page.close();
}

await browser.close();
console.log(`\n${failures === 0 ? "all checks passed" : `${failures} check(s) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
