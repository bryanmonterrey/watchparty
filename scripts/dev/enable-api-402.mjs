#!/usr/bin/env node
/**
 * Turn on the 402 gate in the production env file, completely and auditably.
 *
 *   node scripts/dev/enable-api-402.mjs
 *
 * Does four things to .env.production (values never printed):
 *   1. generates API_GATE_SECRET (crypto-random 32 bytes hex) if absent —
 *      also mirrored into .env so local key creation works; rotating this
 *      later revokes every issued key (see docs/api-monetization.md);
 *   2. sets API_402_MODE=enforce and API_402_PRICE_USD=0.001;
 *   3. copies the three keys the DOTENV_PRODUCTION merge historically added
 *      on top of .env.production (ALERT_WEBHOOK_URL from
 *      .env.production.local; CAPTIONS_WEBHOOK_SECRET and
 *      CLOUDFLARE_API_TOKEN from .env) so .env.production is finally the
 *      complete source of truth and `gh secret set DOTENV_PRODUCTION
 *      < .env.production` is safe again (closes the TODO.md warning);
 *   4. prints the shipped key NAMES for review — never a value.
 */

import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

function read(file) {
    return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function getVal(contents, key) {
    const m = contents.match(new RegExp(`^${key}=(.*)$`, "m"));
    return m ? m[1] : null;
}

function upsert(contents, key, val) {
    const line = `${key}=${val}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    if (re.test(contents)) return contents.replace(re, line);
    return contents.replace(/\n*$/, "\n") + line + "\n";
}

let prod = read(".env.production");
let dev = read(".env");
const prodLocal = read(".env.production.local");
if (!prod || !dev) {
    console.error("run from the project root (.env / .env.production not found)");
    process.exit(1);
}

const changed = [];

// 1. API_GATE_SECRET — reuse if either file already has one, else generate.
let secret = getVal(prod, "API_GATE_SECRET") ?? getVal(dev, "API_GATE_SECRET");
if (!secret) {
    secret = randomBytes(32).toString("hex");
    changed.push("API_GATE_SECRET (generated)");
} else {
    changed.push("API_GATE_SECRET (existing, kept)");
}
prod = upsert(prod, "API_GATE_SECRET", secret);
dev = upsert(dev, "API_GATE_SECRET", secret);

// 2. Mode + price.
prod = upsert(prod, "API_402_MODE", "enforce");
prod = upsert(prod, "API_402_PRICE_USD", "0.001");
changed.push("API_402_MODE=enforce", "API_402_PRICE_USD=0.001");

// 3. The merge keys .env.production was missing (TODO.md warning).
const copies = [
    ["ALERT_WEBHOOK_URL", prodLocal || dev],
    ["CAPTIONS_WEBHOOK_SECRET", dev],
    ["CLOUDFLARE_API_TOKEN", dev],
];
for (const [key, source] of copies) {
    if (getVal(prod, key)) {
        changed.push(`${key} (already present)`);
        continue;
    }
    const val = getVal(source, key);
    if (val === null) {
        console.error(`missing ${key} in source env file — aborting, nothing written`);
        process.exit(1);
    }
    prod = upsert(prod, key, val);
    changed.push(`${key} (copied)`);
}

writeFileSync(".env.production", prod);
writeFileSync(".env", dev);

console.log("updated .env.production (+ API_GATE_SECRET into .env):");
for (const c of changed) console.log(`  - ${c}`);
console.log("\nship it with:\n\n    gh secret set DOTENV_PRODUCTION < .env.production\n");
