#!/usr/bin/env node
/**
 * Two-account browser check for community chat.
 *
 * Community chat is the surface that unit tests structurally cannot see: live
 * delivery, scroll position, and pagination are all cross-user, cross-tab,
 * timing-dependent behaviour. This drives TWO real signed-in users in two
 * browser contexts, sitting in the same channel, and asserts what a person
 * would look for.
 *
 *   bun dev                                             # terminal 1
 *   bun scripts/dev/browser-smoke-community-chat.mjs    # terminal 2
 *
 *   --url http://localhost:3001   base url
 *   --headed                      watch it happen
 *   --timeout 60000               per-step budget
 *   --keep                        leave the browser open at the end
 *
 * Dev only — it leans on mint-test-session/seed-test-community, both of which
 * refuse the production database.
 */

import { execSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i > -1 ? args[i + 1] : d; };
const BASE = flag("url", "http://localhost:3001");
const TIMEOUT = Number(flag("timeout", 60_000));
const HEADED = args.includes("--headed");
const KEEP = args.includes("--keep");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

let failures = 0;
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => { console.log(`  \x1b[31m✗\x1b[0m ${m}`); failures++; };
const info = (m) => console.log(`  \x1b[2m·\x1b[0m ${m}`);

const FIXTURES = ["e2e-test@watchparty.local", "e2e-test-2@watchparty.local"];

// ── is the app up? ───────────────────────────────────────────────────────────
try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok && res.status >= 500) throw new Error(`HTTP ${res.status}`);
} catch (e) {
    console.error(`\ndev server not reachable at ${BASE} (${e.message})\n\n  run:  bun dev\n`);
    process.exit(1);
}

// ── fixtures ─────────────────────────────────────────────────────────────────
console.log("\n1. sessions + seeded community");
const sessions = FIXTURES.map((email) => {
    const raw = execSync(`bun scripts/dev/mint-test-session.mjs --email ${email} --json`, { encoding: "utf8" });
    const parsed = JSON.parse(raw.trim().split("\n").pop());
    return { ...parsed, value: parsed.cookie.slice(parsed.cookieName.length + 1) };
});
sessions.forEach((s) => ok(`session ${s.email}`));

const seed = JSON.parse(
    execSync("bun scripts/dev/seed-test-community.mjs --json", { encoding: "utf8" }).trim().split("\n").pop(),
);
ok(`channel ${seed.url}`);

// ── browser ──────────────────────────────────────────────────────────────────
const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: !HEADED,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

/** Each user gets an isolated context so their cookies don't collide. */
async function openAs(session, label) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultTimeout(TIMEOUT);
    const { hostname } = new URL(BASE);
    await page.setCookie({
        name: session.cookieName,
        value: session.value,
        domain: hostname,
        path: "/",
        secure: BASE.startsWith("https://"),
    });
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));

    // Ground truth for realtime. Asserting only on the DOM can't tell "the
    // server never published" from "the frame arrived and the client ignored
    // it", and those have completely different fixes.
    const sockets = [];
    const frames = [];
    const cdp = await page.target().createCDPSession();
    await cdp.send("Network.enable");
    cdp.on("Network.webSocketCreated", (e) => { if (!e.url.includes("/_next/")) sockets.push(e.url); });
    cdp.on("Network.webSocketFrameReceived", (e) => {
        const d = String(e.response.payloadData);
        if (!d.includes('"built"')) frames.push(d.slice(0, 160)); // skip HMR
    });

    await page.goto(`${BASE}${seed.url}`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });

    // Ask better-auth rather than inferring from the URL: PUBLIC_BROWSING means
    // pages render fine signed-OUT, so "didn't bounce to /login" proves nothing.
    const who = await page.evaluate(async () =>
        fetch("/api/auth/get-session", { credentials: "include" }).then((r) => r.json()).catch(() => null),
    );
    if (who?.user?.email !== session.email) {
        bad(`${label}: expected ${session.email}, got ${who?.user?.email ?? "signed out"}`);
    } else {
        ok(`${label} signed in as ${who.user.email}`);
    }
    return { page, errors, label, sockets, frames };
}

/** Visible text of every rendered message row. */
const readMessages = (page) => page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-message-id]"))
        .map((el) => el.textContent?.trim() ?? "")
        .filter(Boolean),
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls until `fn` returns truthy or the budget runs out. */
async function waitFor(fn, budgetMs, everyMs = 500) {
    const deadline = Date.now() + budgetMs;
    for (;;) {
        const v = await fn();
        if (v) return v;
        if (Date.now() > deadline) return null;
        await sleep(everyMs);
    }
}

try {
    console.log("\n2. both users open the channel");
    const A = await openAs(sessions[0], "A");
    const B = await openAs(sessions[1], "B");

    // The composer is the app's own textarea/input inside the channel.
    // The community composer is a single-line <input>, not a textarea.
    const COMPOSER = '[data-testid="community-composer"]';
    for (const u of [A, B]) {
        const found = await u.page.waitForSelector(COMPOSER, { timeout: TIMEOUT }).catch(() => null);
        if (!found) bad(`${u.label}: no composer found`);
    }

    console.log("\n3. A sends a message");
    // Baseline BEFORE the send. Taking it after (in step 4) counts the very
    // frame we're waiting for as part of the baseline, so a delivered event
    // reads as "0 delivered" and points the blame at the server.
    const framesBefore = B.frames.length;
    const stamp = `e2e-${Date.now()}`;
    await A.page.focus(COMPOSER);
    await A.page.type(COMPOSER, stamp);
    await A.page.keyboard.press("Enter");

    // Optimistic: A should see it without waiting for the network.
    const seenByA = await waitFor(
        async () => (await readMessages(A.page)).some((t) => t.includes(stamp)),
        8_000, 250,
    );
    seenByA ? ok(`A sees own message (${stamp})`) : bad("A never rendered its own message");

    console.log("\n4. B receives it live (no reload)");
    const seenByB = await waitFor(
        async () => (await readMessages(B.page)).some((t) => t.includes(stamp)),
        20_000, 500,
    );
    seenByB ? ok("B received it live") : bad("B never received the message without a reload");
    const delivered = B.frames.length - framesBefore;
    if (!seenByB) {
        const room = B.sockets.find((u) => u.includes("community-channel"));
        const since = B.frames.slice(framesBefore);
        // Count message-change SPECIFICALLY. Presence and typing share the
        // connection, so a raw frame count says "something arrived" and proves
        // nothing about delivery of the thing under test.
        const changes = since.filter((f) => f.includes("message-change"));
        info(`B channel socket: ${room ? "open" : "NONE"}`);
        info(`frames: ${since.length} total, ${changes.length} message-change`);
        since.slice(0, 5).forEach((f) => info(`    ${f}`));
        info(changes.length === 0
            ? "→ no message-change reached B: the SERVER never published to B's room"
            : "→ message-change arrived but the UI did not update: the CLIENT handler is the problem");
    }

    console.log("\n5. no duplicate after the server round trip");
    await sleep(3_000);
    const countA = (await readMessages(A.page)).filter((t) => t.includes(stamp)).length;
    countA === 1
        ? ok("exactly one copy on A (optimistic row was reconciled, not doubled)")
        : bad(`A shows ${countA} copies of the message`);

    console.log("\n6. the list is scrollable and pinned to the newest message");
    const scrollState = await A.page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll("[data-message-id]"));
        const last = rows[rows.length - 1];
        if (!last) return null;
        // Walk up to the nearest actually-scrolling ancestor.
        let el = last.parentElement;
        while (el && el !== document.body) {
            const s = getComputedStyle(el);
            if ((s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight + 4) {
                return {
                    distanceFromBottom: el.scrollHeight - el.scrollTop - el.clientHeight,
                    rows: rows.length,
                };
            }
            el = el.parentElement;
        }
        return { distanceFromBottom: null, rows: rows.length };
    });
    if (!scrollState) {
        bad("no message rows rendered at all");
    } else if (scrollState.distanceFromBottom === null) {
        info(`${scrollState.rows} rows, not yet overflowing — scroll pinning not exercised`);
    } else if (scrollState.distanceFromBottom < 80) {
        ok(`pinned to bottom (${Math.round(scrollState.distanceFromBottom)}px, ${scrollState.rows} rows)`);
    } else {
        bad(`not pinned to bottom: ${Math.round(scrollState.distanceFromBottom)}px away`);
    }

    console.log("\n7. console errors");
    for (const u of [A, B]) {
        // React key/duplicate warnings surface here and are the first symptom
        // of a windowing bug, so they are worth failing on.
        const real = u.errors.filter((e) => !/favicon|Download the React DevTools/i.test(e));
        real.length === 0 ? ok(`${u.label}: clean`) : bad(`${u.label}: ${real.length} error(s)\n      ${real.slice(0, 3).join("\n      ")}`);
    }
} finally {
    if (!KEEP) await browser.close();
    else console.log("\n  --keep: browser left open");
}

console.log(failures === 0 ? "\n\x1b[32mall checks passed\x1b[0m\n" : `\n\x1b[31m${failures} check(s) failed\x1b[0m\n`);
process.exit(failures === 0 ? 0 : 1);
