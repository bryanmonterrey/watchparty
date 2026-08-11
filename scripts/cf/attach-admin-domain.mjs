// Point admin.watchparty.xyz at the main app worker — the internal admin panel.
//
//   node scripts/cf/attach-admin-domain.mjs                # → watchparty-app
//   node scripts/cf/attach-admin-domain.mjs watchparty     # rollback target
//
// Same shape as attach-studio-domain.mjs, and for the same reason: the admin
// panel is a route group INSIDE the main app (middleware rewrites
// admin.watchparty.xyz/* → /admin/* on the same worker, and /api is already
// that worker's own tRPC/better-auth handler). So this is a single
// custom-domain attach — no zone route, unlike the console's separate
// `console-app` worker. Attaching a NEW hostname doesn't touch watchparty.xyz;
// blast radius is the admin subdomain only. Idempotent.
//
// ⚠️ ATTACHING THE DOMAIN IS NOT THE ACCESS CONTROL. The panel is gated by
// `role = 'admin'`, re-read from the database in app/(admin)/layout.tsx and
// re-checked by `adminProcedure` on every mutation. Nobody holds that role
// until `node scripts/db/grant-admin.mjs --user <username>` is run, so this
// hostname serves a redirect to everyone until then — which is the intended
// order: open the door only after deciding who has the key.
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
const HOSTNAME = "admin.watchparty.xyz";
const SERVICE = process.argv[2] ?? "watchparty-app"; // the container worker that serves the main app

const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/domains`, {
  method: "PUT",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    zone_id: ZONE_ID,
    hostname: HOSTNAME,
    service: SERVICE,
    environment: "production",
    override_existing_origin: true,
  }),
});
const json = await res.json();
if (!json.success) throw new Error(`${HOSTNAME} failed: ${JSON.stringify(json.errors)}`);
console.log(`${HOSTNAME} -> ${json.result.service} (${json.result.environment})`);
console.log("admin subdomain attached — serves within seconds.");
console.log("verify: curl -I https://admin.watchparty.xyz/   (expect a redirect until a role='admin' user signs in)");
