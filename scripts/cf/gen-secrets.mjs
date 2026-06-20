// Generates .cf-secrets.json (the input for `wrangler secret bulk`) by merging
// the env files in precedence order. Used by the GitHub Actions deploy and
// runnable locally. Contains NO secrets itself — only merge logic.
//
//   node scripts/cf/gen-secrets.mjs
//
// Precedence (later wins): .env < .env.local < .env.production.local
// In CI only `.env` exists (restored from the DOTENV_PRODUCTION secret).
import fs from "node:fs";

const FILES = [".env", ".env.local", ".env.production.local"];
// Local-only / non-runtime keys that must never become Worker secrets:
const EXCLUDE = new Set([
    "CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE", // local miniflare only
    "NEXTJS_ENV",
]);

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
        // strip a trailing inline comment only when the value isn't quoted
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
for (const k of EXCLUDE) delete merged[k];

fs.writeFileSync(".cf-secrets.json", JSON.stringify(merged));
console.log(`Wrote .cf-secrets.json with ${Object.keys(merged).length} keys`);
