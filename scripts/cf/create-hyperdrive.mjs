// Create a FRESH Hyperdrive config pointed at the same Supabase session pooler
// as the existing watchparty-db config, and print the new config id.
//
// Why (2026-08-06 outage): Hyperdrive's internal pool state for a config can
// wedge (leases leaked by dying worker isolates) such that every query queues
// forever while the DB sits idle — and a config *modification* did NOT clear
// it. A brand-new config id is guaranteed fresh pool state. After running
// this, put the printed id into wrangler.jsonc's hyperdrive binding and
// deploy.
//
// Usage: node scripts/cf/create-hyperdrive.mjs
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
const direct = envVal("DIRECT_URL"); // session pooler — same origin the old config used
if (!account || !token || !direct) throw new Error("need CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, DIRECT_URL in .env");

const u = new URL(direct);
const body = {
  name: `watchparty-db-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`,
  origin: {
    host: u.hostname,
    port: Number(u.port || 5432),
    database: u.pathname.replace(/^\//, "") || "postgres",
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    scheme: "postgres",
  },
};

const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/hyperdrive/configs`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const json = await res.json();
if (!json.success) throw new Error(`create failed: ${JSON.stringify(json.errors)}`);
console.log(`created hyperdrive config "${json.result.name}"`);
console.log(`NEW ID: ${json.result.id}`);
console.log("next: swap this id into wrangler.jsonc hyperdrive binding and deploy");
