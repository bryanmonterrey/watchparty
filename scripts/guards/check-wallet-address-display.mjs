#!/usr/bin/env node
/**
 * Guard: never render a wallet address in the UI.
 *
 * The rule is a product one and it has only ever been enforced by remembering
 * it. This makes it mechanical. Buzz has the identical guard for pubkeys
 * (`check-pubkey-truncation.mjs`) — a truncated key is forgeable by vanity
 * grinding, so display truncation has to be centralized rather than
 * hand-rolled in five places.
 *
 * Flags hand-rolled truncation of anything that looks like an address —
 * `address.slice(0, 4)`, `walletAddress.substring(…)`, `${pubkey.slice(…)}` —
 * outside the canonical helper. FUNCTIONAL uses (passing a full address to an
 * RPC, a map key, a comparison) are untouched; this only catches the shape that
 * exists to shorten something for a human to read.
 *
 *   node scripts/guards/check-wallet-address-display.mjs
 *   node scripts/guards/check-wallet-address-display.mjs --write-allowlist
 */

import path from "node:path";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import { walk, rel, loadAllowlist, report } from "./lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// UI only. A truncated address in a server route is a log line, not a render.
const ROOTS = ["components", "hooks"];
const ALLOWLIST = path.join(root, "scripts/guards/allow-wallet-address-display.txt");

// Deliberately scoped to a USER'S WALLET, not to any base58 string.
//
// A token's contract address and a mint are public identifiers that legitimately
// appear in UI (every explorer shows them), so `tokenAddress`/`tokenMint` are NOT
// matched — including them made the guard cry wolf on 10 of its first 17 hits,
// which is how a guard gets switched off.
const TRUNCATION =
    /\b(?:wallet_?[Aa]ddress|walletAddress|recipientAddress|senderAddress|ownerAddress|swigAddress|userAddress|fromAddress|toAddress|pubkey|publicKey|npub)[\w$]*\??\.(?:slice|substring)\s*\(/g;

// The canonical helper lives here and is allowed to truncate.
const CANONICAL = new Set(["lib/utils.ts"]);

const files = (await Promise.all(ROOTS.map((r) => walk(path.join(root, r))))).flat()
    .filter((f) => /\.(ts|tsx)$/.test(f));

const allow = await loadAllowlist(ALLOWLIST);
const violations = [];

for (const file of files) {
    const relPath = rel(root, file);
    if (CANONICAL.has(relPath)) continue;
    const content = await fs.readFile(file, "utf8");
    if (!/address|pubkey|publicKey/i.test(content)) continue;

    content.split(/\r?\n/).forEach((line, i) => {
        // An explicit opt-out for a reviewed functional use.
        if (line.includes("wallet-address-guard-ok")) return;
        // One report per line, not per match — a line with two truncations is
        // one thing to fix.
        const seen = new Set(line.match(TRUNCATION) ?? []);
        for (const match of seen) {
            const key = `${relPath}:${match.trim()}`;
            if (allow.has(key)) continue;
            violations.push({ key, message: `${relPath}:${i + 1}  ${match.trim()}` });
        }
    });
}

await report({
    label: "wallet-address display guard",
    violations,
    allowlistFile: ALLOWLIST,
    argv: process.argv.slice(2),
    hint:
        "Never render a wallet address to a user. If this is DISPLAY, remove it or\n" +
        "show a name/handle instead. If it is FUNCTIONAL (an RPC arg, a cache key, a\n" +
        "comparison) append a `// wallet-address-guard-ok` comment on that line with a\n" +
        "reason, or add the entry to scripts/guards/allow-wallet-address-display.txt.",
});
