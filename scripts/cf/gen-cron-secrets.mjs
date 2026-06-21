// Generates cron/.cf-secrets.json (input for `wrangler secret bulk` on the
// watchparty-cron worker). Extracts only CRON_SECRET — the cron worker calls the
// app's guarded /api/cron/* routes with it. Contains NO secrets itself.
//
//   node scripts/cf/gen-cron-secrets.mjs
//
// Precedence (later wins): .env < .env.local < .env.production.local
// In CI only `.env` exists (restored from the DOTENV_PRODUCTION secret).
import fs from "node:fs";

const FILES = [".env", ".env.local", ".env.production.local"];
const INCLUDE = ["CRON_SECRET"];

function parseEnv(file) {
    const out = {};
    if (!fs.existsSync(file)) return out;
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
        const t = line.trim();
        if (!t || t.startsWith("#")) continue;
        const i = t.indexOf("=");
        if (i < 0) continue;
        const k = t.slice(0, i).trim();
        let v = t.slice(i + 1);
        if (!/^["']/.test(v.trim())) {
            const h = v.indexOf(" #");
            if (h >= 0) v = v.slice(0, h);
        }
        v = v.trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        out[k] = v;
    }
    return out;
}

const merged = {};
for (const f of FILES) Object.assign(merged, parseEnv(f));

const picked = {};
for (const k of INCLUDE) {
    if (merged[k]) picked[k] = merged[k];
}

if (!picked.CRON_SECRET) {
    console.error("ERROR: CRON_SECRET missing from env — cron worker auth will fail.");
    process.exit(1);
}

fs.writeFileSync("cron/.cf-secrets.json", JSON.stringify(picked));
console.log(`Wrote cron/.cf-secrets.json with ${Object.keys(picked).length} key(s)`);
