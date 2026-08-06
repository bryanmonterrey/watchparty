// Point the EXISTING Hyperdrive config (the one the deployed worker's binding
// references) at the Supabase TRANSACTION pooler (port 6543, from DATABASE_URL).
//
// Why: an origin change forces Hyperdrive to discard its pools for the config
// — the fix for a wedged pool that a caching-toggle bump could not clear — and
// it takes effect on the RUNNING worker immediately, no deploy needed (used
// 2026-08-06 while GitHub Actions was in a major outage and CI deploys were
// impossible). Transaction mode also survives lease leaks far better than
// session mode: a dead client's server connection is reclaimed at transaction
// end instead of being pinned forever. postgres.js already runs prepare:false,
// which is what transaction mode requires.
//
// Usage: node scripts/cf/switch-hyperdrive-origin.mjs [config-id]
import fs from "node:fs";

function envVal(key) {
  for (const line of fs.readFileSync(".env", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0 || t.slice(0, i).trim() !== key) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    return v;
  }
  return undefined;
}

const account = envVal("CLOUDFLARE_ACCOUNT_ID");
const token = envVal("CLOUDFLARE_API_TOKEN");
const txUrl = envVal("DATABASE_URL"); // transaction pooler (port 6543)
if (!account || !token || !txUrl) throw new Error("need CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, DATABASE_URL in .env");

const CONFIG_ID = process.argv[2] ?? "85d170665be54585b8f8124bd9fbb404"; // watchparty-db (bound in deployed worker)

const u = new URL(txUrl);
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${account}/hyperdrive/configs/${CONFIG_ID}`,
  {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: {
        host: u.hostname,
        port: Number(u.port || 6543),
        database: u.pathname.replace(/^\//, "") || "postgres",
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        scheme: "postgres",
      },
    }),
  },
);
const json = await res.json();
if (!json.success) throw new Error(`PATCH failed: ${JSON.stringify(json.errors)}`);
console.log(`config ${CONFIG_ID} origin now ${json.result.origin.host}:${json.result.origin.port}`);
console.log("hyperdrive will rebuild pools against the transaction pooler — test the site in ~30s");
