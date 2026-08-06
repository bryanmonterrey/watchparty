// Force Hyperdrive to tear down and recreate its origin connection pools by
// modifying the config twice (caching off → on; any config change recycles
// pools per Cloudflare docs). Net config change: none.
//
// Why this exists (2026-08-06): worker isolates dying mid-query leak
// Hyperdrive pool leases. The DB ends up clean and idle while every query
// through Hyperdrive queues forever — the site hangs on skeletons with
// nothing visible in pg_stat_activity. The pg_cron reaper
// (db/reap-wedged-connections.sql) clears the DB-side wedge, but only a
// config bump clears Hyperdrive's own state.
//
// Usage: node scripts/cf/bump-hyperdrive.mjs
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
if (!account || !token) throw new Error("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN missing from .env");

const CONFIG_ID = "85d170665be54585b8f8124bd9fbb404"; // watchparty-db

async function patch(caching) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/hyperdrive/configs/${CONFIG_ID}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ caching }),
    },
  );
  const json = await res.json();
  if (!json.success) throw new Error(`PATCH failed: ${JSON.stringify(json.errors)}`);
  console.log(`caching.disabled=${caching.disabled} applied`);
}

await patch({ disabled: true });
await new Promise((r) => setTimeout(r, 3000));
await patch({ disabled: false });
console.log("hyperdrive pools recycled (config bumped twice, net change: none)");
