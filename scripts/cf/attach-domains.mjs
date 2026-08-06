// Move watchparty.xyz + www between the two production workers:
//   watchparty      — the plain OpenNext Worker (the documented rollback target)
//   watchparty-app  — the container worker (container/wrangler.jsonc; see the
//                     deploy-container job in deploy.yml)
//
// Written during the 2026-08-06 outage, when the container worker's DB path
// wedged and the domains were rolled back to `watchparty`. Cutting over to the
// container again = run the deploy-container workflow, then:
//   node scripts/cf/attach-domains.mjs watchparty-app
//
// Usage: node scripts/cf/attach-domains.mjs
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
const SERVICE = process.argv[2] ?? "watchparty";

for (const hostname of ["watchparty.xyz", "www.watchparty.xyz"]) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/domains`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      zone_id: ZONE_ID,
      hostname,
      service: SERVICE,
      environment: "production",
      override_existing_origin: true,
    }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`${hostname} failed: ${JSON.stringify(json.errors)}`);
  console.log(`${hostname} -> ${json.result.service} (${json.result.environment})`);
}
console.log("domains re-attached — site should serve the fixed worker within seconds");
