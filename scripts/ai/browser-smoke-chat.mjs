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
const IS_HTTPS = BASE.startsWith("https://");
let cookieValue;
let cookieName;
try {
    // --yes-production when the target is https, because the cookie NAME
    // differs by target: better-auth sets `useSecureCookies` in production and
    // prefixes with `__Secure-`. This script used to hardcode the dev name, so
    // pointing it at production produced a rejected cookie that looked exactly
    // like a failed login — which meant every "smoke green" it ever reported
    // was localhost, never the deployed app.
    const raw = execSync(
        `bun scripts/dev/mint-test-session.mjs --json${IS_HTTPS ? " --yes-production" : ""}`,
        { encoding: "utf8" },
    );
    const parsed = JSON.parse(raw.trim().split("\n").pop());
    cookieValue = parsed.cookie.slice(parsed.cookieName.length + 1);
    // Taken from the mint script rather than restated here, so the two can't
    // drift.
    cookieName = parsed.cookieName;
    ok(`session for ${parsed.email} (${cookieName})`);
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
    // secure:true is required for a __Secure- prefixed cookie to be stored at
    // all — Chrome silently drops it otherwise.
    await page.setCookie({
        name: cookieName,
        value: cookieValue,
        domain: hostname,
        path: "/",
        secure: IS_HTTPS,
    });

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

    // ── CONTRAST, not just presence ─────────────────────────────────────────
    // The reason this test went green four times while the panel was blank for
    // a real user: the assistant/user text was styled with theme-flipping
    // tokens (--flexwhite is near-BLACK in light mode) on a hardcoded dark
    // panel. The DOM had the text; nobody could read it. textContent
    // assertions are structurally blind to that, so check luminance too.
    console.log("\n6. checking the text is actually VISIBLE (not same-on-same)");
    const contrast = await page.evaluate(() => {
        // Resolve ANY css colour through a canvas pixel. getComputedStyle now
        // returns lab()/oklch() for tailwind's palette, and hand-parsing those
        // as rgb yields nonsense — the first version of this check called
        // perfectly readable text "unreadable" because lab(90.7 ...) parsed as
        // rgb(90, 0.4, -1.5). Painting the colour and reading the pixel back is
        // the only parser that is always right.
        const cv = document.createElement("canvas");
        cv.width = cv.height = 1;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        const toRgb = (css) => {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillStyle = "#000";
            ctx.fillStyle = css;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
            return [r, g, b];
        };
        const lum = (css) => {
            const [r, g, b] = toRgb(css);
            const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
            return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const bgOf = (el) => {
            for (let n = el; n; n = n.parentElement) {
                const bg = getComputedStyle(n).backgroundColor;
                if (bg && !/rgba?\(0, 0, 0, 0\)|transparent/.test(bg)) return bg;
            }
            return getComputedStyle(document.body).backgroundColor || "rgb(0,0,0)";
        };
        const out = [];
        for (const el of document.querySelectorAll("[data-assistant-message]")) {
            const target = [...el.querySelectorAll("p, div")].find((n) => (n.textContent ?? "").trim().length > 20) ?? el;
            const fg = getComputedStyle(target).color;
            const bg = bgOf(target);
            const L1 = lum(fg), L2 = lum(bg);
            const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
            out.push({ fg, bg, ratio: Math.round(ratio * 100) / 100 });
        }
        return out;
    });
    for (const c of contrast) {
        // 4.5:1 is the WCAG AA floor for body text. Anything near 1:1 is
        // same-colour-on-same-colour, i.e. invisible.
        c.ratio >= 4.5
            ? ok(`contrast ${c.ratio}:1 (${c.fg} on ${c.bg})`)
            : bad(`UNREADABLE — contrast ${c.ratio}:1 (${c.fg} on ${c.bg})`);
    }
    if (!contrast.length) bad("no assistant message to contrast-check");

    // ── GEOMETRY ────────────────────────────────────────────────────────────
    // The check that was missing. querySelector finds elements regardless of
    // layout and getComputedStyle reports colours regardless of size, so this
    // test passed for hours while every message rendered 0px WIDE — text
    // wrapping one character per line, 22,548px tall, shoved ~22,000px above
    // the scroll viewport. Present, readable, and completely unreachable.
    console.log("\n7. checking the message has real geometry and is in view");
    const geom = await page.evaluate(() => {
        const msg = document.querySelector("[data-assistant-message]");
        if (!msg) return null;
        const scroller = msg.closest(".overflow-y-auto") ?? msg.parentElement;
        const m = msg.getBoundingClientRect();
        const s = scroller.getBoundingClientRect();
        return {
            w: Math.round(m.width), h: Math.round(m.height),
            scrollerW: Math.round(s.width), scrollerH: Math.round(s.height),
            // Does any part of the message fall inside the scroll viewport?
            intersects: m.top < s.bottom && m.bottom > s.top,
        };
    });
    if (!geom) bad("no assistant message to measure");
    else {
        geom.w > 50
            ? ok(`width ${geom.w}px (scroller ${geom.scrollerW}px)`)
            : bad(`ZERO-WIDTH message (${geom.w}px) — text wraps per character and leaves the viewport`);
        geom.h < 5000
            ? ok(`height ${geom.h}px — sane`)
            : bad(`absurd height ${geom.h}px — the classic zero-width wrap signature`);
        geom.intersects
            ? ok("message intersects the scroll viewport (actually on screen)")
            : bad("message is OUTSIDE the scroll viewport — nobody can see it");
    }

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
