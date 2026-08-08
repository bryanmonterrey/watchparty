#!/usr/bin/env node
/**
 * Put a secret into the env files without it passing through anything that
 * keeps a transcript.
 *
 *   node scripts/dev/set-env-secret.mjs HELIUS_API_KEY
 *
 * Why this exists: pasting a key into a chat, a commit message, or a shell
 * command makes it permanently readable — chat transcripts are stored, and
 * `history` keeps the command. This reads from the terminal with echo OFF, so
 * the value is never displayed, never in scrollback, and never in shell
 * history. It prints only a length and a masked prefix, which is enough to
 * confirm you pasted the right thing and not enough to reconstruct it.
 *
 * It writes to .env, .env.local and .env.production, because this project
 * expects all three (dev, dev-DB override, and the file that becomes the
 * DOTENV_PRODUCTION GitHub secret).
 *
 * Deploy note: production reads env from the DOTENV_PRODUCTION secret, which
 * deploy.yml writes to .env before building — so editing the local file alone
 * changes NOTHING in production. The script prints the one command that
 * actually ships it.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";

const ENV_FILES = [".env", ".env.local", ".env.production"];

const key = process.argv[2];
if (!key || !/^[A-Z0-9_]+$/.test(key)) {
    console.error("usage: node scripts/dev/set-env-secret.mjs <ENV_VAR_NAME>");
    console.error("example: node scripts/dev/set-env-secret.mjs HELIUS_API_KEY");
    process.exit(1);
}

/** Reads a line with echo disabled, so the value never appears on screen. */
function promptHidden(question) {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        // muted is read by the patched _writeToOutput below.
        rl.output.muted = false;
        const origWrite = rl._writeToOutput?.bind(rl);
        rl._writeToOutput = function (str) {
            if (rl.output.muted) return; // swallow the echoed characters
            origWrite ? origWrite(str) : rl.output.write(str);
        };
        rl.question(question, (answer) => {
            rl.output.muted = false;
            rl.output.write("\n");
            rl.close();
            resolve(answer.trim());
        });
        rl.output.muted = true;
    });
}

const value = await promptHidden(`paste ${key} (input hidden, then Enter): `);
if (!value) {
    console.error("nothing entered — aborted, no files changed");
    process.exit(1);
}

// Masked confirmation. Enough to catch a truncated paste or a stray quote,
// not enough to be worth capturing.
console.log(`\n  received ${value.length} chars, starts "${value.slice(0, 4)}…" ends "…${value.slice(-2)}"`);

/**
 * Helius composes its RPC URL from the key, so setting the key alone would
 * leave HELIUS_RPC_URL pointing at the OLD one and the rotation would look
 * like it silently failed.
 */
const derived =
    key === "HELIUS_API_KEY"
        ? { HELIUS_RPC_URL: `https://mainnet.helius-rpc.com/?api-key=${value}` }
        : {};

function upsert(contents, name, val) {
    const line = `${name}=${val}`;
    const re = new RegExp(`^${name}=.*$`, "m");
    if (re.test(contents)) return contents.replace(re, line);
    return contents.replace(/\n*$/, "\n") + line + "\n";
}

const changed = [];
for (const file of ENV_FILES) {
    if (!existsSync(file)) continue;
    let text = readFileSync(file, "utf8");
    text = upsert(text, key, value);
    for (const [k, v] of Object.entries(derived)) text = upsert(text, k, v);
    writeFileSync(file, text);
    changed.push(file);
}

if (!changed.length) {
    console.error("no env files found — are you in the project root?");
    process.exit(1);
}

console.log(`  updated: ${changed.join(", ")}`);
for (const k of Object.keys(derived)) console.log(`  also rebuilt: ${k}`);

console.log(`
  these files are gitignored, so nothing here reaches a commit.

  PRODUCTION still has the old value. deploy.yml builds from the
  DOTENV_PRODUCTION secret, not from your disk. Ship it with:

      gh secret set DOTENV_PRODUCTION < .env.production

  then redeploy (push, or re-run the last workflow).
`);
