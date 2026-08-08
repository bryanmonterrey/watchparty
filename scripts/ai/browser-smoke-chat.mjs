#!/usr/bin/env node
/**
 * Browser smoke test for "ask chat" — the check that was missing.
 *
 * Every other gate in this repo (tsc, bun test, CI, even the model smoke test)
 * passed while the chat rendered EMPTY BUBBLES in the browser for eight
 * consecutive deploys. Nothing asserted that text reaches the DOM. This does.
 *
 * It drives the real app as a real signed-in user:
 *   mint a session cookie -> open /home -> click the dock's star -> type ->
 *   assert visible assistant text appears
 *
 * Requires the dev server running (it will tell you if it isn't) and uses the
 * dev database via scripts/dev/mint-test-session.mjs, which refuses prod.
 *
 *   bun dev                                   # terminal 1
 *   bun scripts/ai/browser-smoke-chat.mjs     # terminal 2
 *
 *   --url http://localhost:3001   base url
 *   --headed                      watch it happen
 *   --timeout 90000               per-step budget
 */

import { execSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i > -1 ? args[i + 1] : d; };
const BASE = flag("url", "http://localhost:3001");
const TIMEOUT = Number(flag("timeout", 90_000));
const HEADED = args.includes("--headed");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

let failures = 0;
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => { console.log(`  \x1b[31m✗\x1b[0m ${m}`); failures++; };

// ── is the app up? ───────────────────────────────────────────────────────────
try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(8000) });
    if (!res.ok && res.status >= 500) throw new Error(`HTTP ${res.status}`);
} catch (e) {
    console.error(`\ndev server not reachable at ${BASE} (${e.message})\n\n  run:  bun dev\n`);
    process.exit(1);
}

// ── session ──────────────────────────────────────────────────────────────────
console.log("\n1. minting a session");
let cookieValue;
try {
    const raw = execSync("bun scripts/dev/mint-test-session.mjs --json", { encoding: "utf8" });
    const parsed = JSON.parse(raw.trim().split("\n").pop());
    cookieValue = parsed.cookie.split("=").slice(1).join("=");
    ok(`session for ${parsed.email}`);
} catch (e) {
    bad(`could not mint a session: ${e.message}`);
    process.exit(1);
}

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: !HEADED,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
    const page = await browser.newPage();
    // The dock is `hidden xl:block` — below 1280px the star button does not
    // exist and every assertion below would fail for the wrong reason.
    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultTimeout(TIMEOUT);

    const { hostname } = new URL(BASE);
    await page.setCookie({ name: "better-auth.session_token", value: cookieValue, domain: hostname, path: "/" });

    const consoleErrors = [];
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 200)}`));

    console.log("\n2. loading /home signed in");
    await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
    // ASK BETTER-AUTH, don't infer from the URL. PUBLIC_BROWSING is true, so
    // /home renders fine signed-OUT — "wasn't bounced to /login" proved nothing
    // and passed happily while the cookie was being rejected.
    const who = await page.evaluate(async () =>
        fetch("/api/auth/get-session", { credentials: "include" }).then((r) => r.json()).catch(() => null),
    );
    const loggedIn = !!who?.user?.email;
    loggedIn ? ok(`signed in as ${who.user.email}`) : bad("cookie rejected — get-session returned no user");
    if (!loggedIn) throw new Error("not signed in");

    console.log("\n3. opening the assistant");
    await page.waitForSelector('button[aria-label="ask chat"]', { timeout: TIMEOUT });

    // Click until the panel actually opens, rather than assuming one lands.
    // Three separate things bite here:
    //   - `domcontentloaded` fires before React hydrates, so an early click is
    //     swallowed with no error at all;
    //   - the dock re-renders on its 30s unread poll, so an ElementHandle
    //     captured earlier detaches ("Node is either not clickable");
    //   - a hand-built MouseEvent doesn't drive React 19 — it wants the real
    //     pointer sequence, which is why this uses page.click(selector).
    // Polling aria-expanded is the honest signal: it's the button's own state.
    const isOpen = () =>
        page.evaluate(() => !!document.querySelector('[data-ask-panel], [role="dialog"][aria-label="ask chat"]'));

    let opened = await isOpen();
    for (let attempt = 0; attempt < 10 && !opened; attempt++) {
        // Only click when it is actually CLOSED. The button TOGGLES, so a naive
        // retry loop opens the panel and then immediately shuts it again —
        // which is what made this report "never opened" while the panel was
        // fine. Re-checking first turns the retry into a genuine retry.
        if (!(await isOpen())) await page.click('button[aria-label="ask chat"]').catch(() => {});
        for (let i = 0; i < 16 && !opened; i++) {
            await new Promise((r) => setTimeout(r, 500));
            opened = await isOpen();
        }
    }
    opened ? ok("panel opened") : bad("panel never opened after 12 click attempts");
    if (!opened) throw new Error("panel did not open");

    console.log("\n4. sending a message");
    const input = await page.waitForSelector('[role="dialog"] textarea, [data-ask-panel] textarea', { timeout: TIMEOUT });
    await input.type("what is watchparty? one short sentence.");
    await page.keyboard.press("Enter");
    ok("message submitted");

    // THE ASSERTION THAT MATTERS. Poll for assistant prose in the DOM rather
    // than for a spinner — a spinner proved nothing when replies were empty.
    console.log("\n5. waiting for VISIBLE assistant text");
    const started = Date.now();
    let seen = "";
    while (Date.now() - started < TIMEOUT) {
        seen = await page.evaluate(() => {
            // Scoped to the assistant's own message node. An earlier version
            // queried every p/div under the panel and matched the header +
            // suggestion chips, reporting success in 0.0s while the reply was
            // empty. Only [data-assistant-message] is the model's answer.
            const nodes = [...document.querySelectorAll("[data-assistant-message]")];
            return nodes.map((n) => n.textContent?.trim() ?? "").sort((a, b) => b.length - a.length)[0] ?? "";
        });
        if (seen.length > 25) break;
        await new Promise((r) => setTimeout(r, 1000));
    }
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    seen.length > 25
        ? ok(`visible text after ${secs}s: "${seen.slice(0, 90)}…"`)
        : bad(`NO VISIBLE TEXT after ${secs}s — this is the regression that shipped 8x`);

    if (consoleErrors.length) {
        console.log(`\n  \x1b[2mconsole errors (${consoleErrors.length}):\x1b[0m`);
        for (const e of consoleErrors.slice(0, 5)) console.log(`  \x1b[2m  ${e}\x1b[0m`);
    }
} catch (e) {
    bad(`threw: ${e.message}`);
} finally {
    await browser.close();
}

console.log(failures === 0 ? "\n\x1b[32mchat renders — browser smoke passed\x1b[0m\n"
                           : `\n\x1b[31m${failures} check(s) failed\x1b[0m\n`);
process.exit(failures === 0 ? 0 : 1);
