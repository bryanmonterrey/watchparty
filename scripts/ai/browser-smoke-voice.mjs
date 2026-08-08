#!/usr/bin/env node
/**
 * Does the mic button actually transcribe speech?
 *
 *   bun scripts/ai/browser-smoke-voice.mjs --url https://watchparty.xyz
 *
 * The thing this exists to prove is the whole chain, end to end and in a real
 * browser: token route → MediaRecorder → Deepgram WebSocket → interim results →
 * text landing in the composer. Every link is invisible to tsc and to CI, and
 * three of them (subprotocol auth, container sniffing, is_final handling) are
 * places where a wrong guess compiles perfectly and produces silence.
 *
 * "Headless can't grant a microphone" is wrong, which is why this is possible:
 * Chrome takes --use-fake-ui-for-media-stream to auto-accept the permission
 * prompt and --use-file-for-fake-audio-capture to play a WAV in place of a real
 * device. So the browser genuinely records; it just records a file.
 *
 * The audio is SYNTHESISED at run time by Deepgram's own TTS rather than
 * committed as a fixture — a 78KB binary in git that has to stay in sync with
 * an assertion string is exactly the kind of thing that rots. Chrome requires
 * 16-bit PCM mono WAV, and Deepgram's streaming response carries a placeholder
 * length in its header, so the header is rewritten before use.
 */

import { execSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i > -1 ? args[i + 1] : d; };
const BASE = flag("url", "http://localhost:3001");
const TIMEOUT = Number(flag("timeout", 90_000));
const HEADED = args.includes("--headed");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const IS_HTTPS = BASE.startsWith("https://");

// Short, unambiguous, and full of words a general model gets right. The
// assertion is on CONTENT WORDS, not an exact string: ASR legitimately varies
// on punctuation and casing, and demanding an exact match would make this fail
// for reasons that aren't bugs.
const PHRASE = "What coins are moving right now on watchparty?";
const EXPECT = ["coins", "moving", "right", "now"];

let failures = 0;
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => { console.log(`  \x1b[31m✗\x1b[0m ${m}`); failures++; };

const dir = mkdtempSync(join(tmpdir(), "wp-voice-"));
const wavPath = join(dir, "speech.wav");

// ── 1. synthesise the audio ──────────────────────────────────────────────────
console.log("\n1. synthesising speech");
function readEnv(key) {
    for (const f of [".env.production", ".env.local", ".env"]) {
        try {
            const line = execSync(`grep -m1 '^${key}=' ${f}`, { encoding: "utf8" }).trim();
            if (line) return line.slice(key.length + 1).replace(/^["']|["']$/g, "");
        } catch { /* file missing or key absent */ }
    }
    return null;
}

const dgKey = readEnv("DEEPGRAM_API_KEY");
if (!dgKey) { bad("no DEEPGRAM_API_KEY"); process.exit(1); }

try {
    const res = await fetch(
        "https://api.deepgram.com/v1/speak?model=aura-2-thalia-en&encoding=linear16&sample_rate=16000&container=wav",
        {
            method: "POST",
            headers: { authorization: `Token ${dgKey}`, "content-type": "application/json" },
            body: JSON.stringify({ text: PHRASE }),
            signal: AbortSignal.timeout(60_000),
        },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pcm = Buffer.from(await res.arrayBuffer()).subarray(44);

    // A correct 44-byte canonical WAV header. Deepgram streams its response, so
    // the header it sends claims a placeholder length — Chrome reads that and
    // either refuses the file or plays garbage.
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + pcm.length, 4);
    header.write("WAVEfmt ", 8);
    header.writeUInt32LE(16, 16);          // fmt chunk size
    header.writeUInt16LE(1, 20);           // PCM
    header.writeUInt16LE(1, 22);           // mono
    header.writeUInt32LE(16000, 24);       // sample rate
    header.writeUInt32LE(32000, 28);       // byte rate = rate * channels * 2
    header.writeUInt16LE(2, 32);           // block align
    header.writeUInt16LE(16, 34);          // bits per sample
    header.write("data", 36);
    header.writeUInt32LE(pcm.length, 40);
    writeFileSync(wavPath, Buffer.concat([header, pcm]));
    ok(`${(pcm.length / 32000).toFixed(2)}s of speech: "${PHRASE}"`);
} catch (e) {
    bad(`TTS failed: ${e.message}`);
    process.exit(1);
}

// ── 2. session ───────────────────────────────────────────────────────────────
console.log("\n2. minting a session");
let cookieValue, cookieName;
try {
    const raw = execSync(
        `bun scripts/dev/mint-test-session.mjs --json${IS_HTTPS ? " --yes-production" : ""}`,
        { encoding: "utf8" },
    );
    const parsed = JSON.parse(raw.trim().split("\n").pop());
    cookieName = parsed.cookieName;
    cookieValue = parsed.cookie.slice(cookieName.length + 1);
    ok(`session for ${parsed.email}`);
} catch (e) {
    bad(`could not mint a session: ${e.message}`);
    process.exit(1);
}

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: !HEADED,
    args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        // Auto-accept getUserMedia instead of showing the permission prompt.
        "--use-fake-ui-for-media-stream",
        // Replace the capture device with our file. --use-fake-device is
        // implied and would otherwise emit a beep tone, which transcribes to
        // nothing and makes this look broken.
        `--use-file-for-fake-audio-capture=${wavPath}`,
    ],
});

try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.setDefaultTimeout(TIMEOUT);
    const { hostname } = new URL(BASE);
    await page.setCookie({ name: cookieName, value: cookieValue, domain: hostname, path: "/", secure: IS_HTTPS });

    // Grant up front as well as via the flag — the flag covers the prompt, this
    // covers the permissions API that getUserMedia consults first.
    await browser.defaultBrowserContext().overridePermissions(BASE, ["microphone"]);

    console.log("\n3. loading /home signed in");
    await page.goto(`${BASE}/home`, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
    const who = await page.evaluate(async () =>
        fetch("/api/auth/get-session", { credentials: "include" }).then((r) => r.json()).catch(() => null),
    );
    if (!who?.user?.email) { bad("cookie rejected"); throw new Error("not signed in"); }
    ok(`signed in as ${who.user.email}`);

    console.log("\n4. opening the assistant");
    await page.waitForSelector('button[aria-label="ask chat"]', { timeout: TIMEOUT });
    const isOpen = () => page.$('[data-ask-panel]').then(Boolean);
    for (let i = 0; i < 12 && !(await isOpen()); i++) {
        await page.click('button[aria-label="ask chat"]').catch(() => {});
        await new Promise((r) => setTimeout(r, 500));
    }
    (await isOpen()) ? ok("panel opened") : bad("panel never opened");

    console.log("\n5. pressing the mic");
    // The composer button is the mic only while the input is empty — that is
    // the design (speak when there's nothing to send), so an empty input is a
    // precondition of this test rather than an accident.
    const micSel = 'button[aria-label="speak"]';
    await page.waitForSelector(micSel, { timeout: 15_000 });
    await page.click(micSel);

    // It becomes a stop control once recording actually starts, which is the
    // first real signal that the token fetch and getUserMedia both succeeded.
    try {
        await page.waitForSelector('button[aria-label="stop dictating"]', { timeout: 25_000 });
        ok("recording started (token + mic permission OK)");
    } catch {
        bad("never entered the recording state — token route or getUserMedia failed");
    }

    console.log("\n6. waiting for a transcript in the composer");
    let transcript = "";
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
        transcript = await page.$eval("textarea", (el) => el.value).catch(() => "");
        if (EXPECT.every((w) => transcript.toLowerCase().includes(w))) break;
        await new Promise((r) => setTimeout(r, 700));
    }

    if (!transcript.trim()) {
        bad("composer stayed EMPTY — no transcript arrived");
    } else if (EXPECT.every((w) => transcript.toLowerCase().includes(w))) {
        ok(`transcribed: "${transcript.trim().slice(0, 90)}"`);
    } else {
        // Partial text still proves the socket works; call it out rather than
        // passing it off as success.
        bad(`transcript did not match. got: "${transcript.trim().slice(0, 90)}"`);
    }

    console.log("\n7. stopping cleanly");
    await page.click('button[aria-label="stop dictating"]').catch(() => {});
    await new Promise((r) => setTimeout(r, 2000));
    // A live track after stop means the browser's recording indicator stays lit
    // with nothing on screen to explain it.
    const stillRecording = await page.$('button[aria-label="stop dictating"]').then(Boolean);
    stillRecording ? bad("still recording after stop") : ok("returned to idle");
} catch (e) {
    bad(`threw: ${e.message}`);
} finally {
    await browser.close();
}

console.log(
    failures === 0
        ? "\n\x1b[32mvoice dictation works — smoke passed\x1b[0m\n"
        : `\n\x1b[31m${failures} check(s) failed\x1b[0m\n`,
);
process.exit(failures === 0 ? 0 : 1);
