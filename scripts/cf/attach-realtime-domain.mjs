// Attach realtime.watchparty.xyz to the watchparty-realtime worker (the
// PartyServer DO). Deliberately done via the API rather than
// `custom_domains` in realtime/wrangler.jsonc: the CI deploy token may lack
// the zone permission, and a failed deploy-realtime job would block security
// fixes. Attaching here is additive — the *.workers.dev host keeps serving,
// so nothing needs to flip atomically.
//
// After attaching, point clients at it by updating REALTIME_HOST /
// NEXT_PUBLIC_REALTIME_HOST in the deploy env (DOTENV_PRODUCTION secret) —
// the /api/stream/token mint returns `host` from env, so third-party daemons
// follow automatically on their next mint.
//
// Usage: node scripts/cf/attach-realtime-domain.mjs
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
if (!account || !token) throw new Error("need CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env");

const ZONE_ID = "08d8c49c6cf32031f1c006507565ac7f"; // watchparty.xyz
const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/domains`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    zone_id: ZONE_ID,
    hostname: "realtime.watchparty.xyz",
    service: "watchparty-realtime",
    environment: "production",
    override_existing_origin: true,
  }),
});
const json = await res.json();
if (!json.success) throw new Error(`failed: ${JSON.stringify(json.errors)}`);
console.log(`realtime.watchparty.xyz -> ${json.result.service} (${json.result.environment})`);
