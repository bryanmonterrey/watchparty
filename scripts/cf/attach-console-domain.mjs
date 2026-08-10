// Point console.watchparty.xyz at a worker — the console cutover + rollback
// lever (sibling of attach-domains.mjs, same API, one hostname).
//
//   node scripts/cf/attach-console-domain.mjs                # → console-app
//   node scripts/cf/attach-console-domain.mjs watchparty-app # rollback: interim portal
//
// Before the first cutover it ALSO ensures the zone route
// `console.watchparty.xyz/api/*` → watchparty-app exists. Routes beat custom
// domains on specificity, so /api keeps hitting the MAIN worker (tRPC,
// better-auth, same-origin cookie) while everything else serves the console.
// The route is idempotent and harmless while the domain still points at
// watchparty-app, so it's safe to run this any time.
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
const HOSTNAME = "console.watchparty.xyz";
const API_ROUTE_PATTERN = `${HOSTNAME}/api/*`;
const API_SERVICE = "watchparty-app"; // the worker that owns /api (main container)
const SERVICE = process.argv[2] ?? "console-app";

const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

// 1. Ensure the /api/* zone route → main worker. BEST-EFFORT: the current
// API token has account-level Workers perms but not Zone → Workers Routes
// (verified 2026-08-10: list routes → code 10000). The console still works
// without it — its next.config rewrite proxies /api to watchparty.xyz — the
// route just removes that extra hop. Grant the permission at the next token
// rotation (scheduled 2026-08-20) and re-run this script.
try {
  await ensureApiRoute();
} catch (err) {
  console.warn(`zone route skipped (${err.message}) — /api rides the rewrite proxy fallback`);
}

async function ensureApiRoute() {
const routesRes = await fetch(
  `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes`,
  { headers },
);
const routes = await routesRes.json();
if (!routes.success) throw new Error(`list routes failed: ${JSON.stringify(routes.errors)}`);
const existing = routes.result.find((r) => r.pattern === API_ROUTE_PATTERN);
if (!existing) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ pattern: API_ROUTE_PATTERN, script: API_SERVICE }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(`create route failed: ${JSON.stringify(json.errors)}`);
  console.log(`route created: ${API_ROUTE_PATTERN} -> ${API_SERVICE}`);
} else if (existing.script !== API_SERVICE) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/workers/routes/${existing.id}`,
    { method: "PUT", headers, body: JSON.stringify({ pattern: API_ROUTE_PATTERN, script: API_SERVICE }) },
  );
  const json = await res.json();
  if (!json.success) throw new Error(`update route failed: ${JSON.stringify(json.errors)}`);
  console.log(`route repointed: ${API_ROUTE_PATTERN} -> ${API_SERVICE}`);
} else {
  console.log(`route ok: ${API_ROUTE_PATTERN} -> ${API_SERVICE}`);
}
}

// 2. Attach the hostname to the requested worker.
const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/domains`, {
  method: "PUT",
  headers,
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
