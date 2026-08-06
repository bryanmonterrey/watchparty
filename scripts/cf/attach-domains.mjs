// Re-attach watchparty.xyz + www to the `watchparty` worker (2026-08-06 outage).
//
// The domain had been moved to a separate `watchparty-app` script (created
// 03:25 UTC today, code frozen at 14:51) while every repo/CI deploy updates
// the script named `watchparty` — so no fix ever reached visitors. The
// `watchparty` script is fully deployed with the DB fix, has all runtime
// secrets, and is verified working on its workers.dev URL. This points the
// domains back at it. Revert = same call with service: "watchparty-app".
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
