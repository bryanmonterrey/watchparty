// Provisions a Cloudflare RealtimeKit app + verifies presets for Spaces audio.
// Reads CF creds from .env (never from chat). Idempotent: reuses an existing
// "watchparty" app if present.
//
//   node scripts/cf/provision-realtimekit.mjs
//
// Needs in .env:
//   CLOUDFLARE_ACCOUNT_ID=...
//   CLOUDFLARE_API_TOKEN=...      (token with Realtime / Realtime Admin perms)
// Optional preset name overrides (defaults match RealtimeKit built-ins):
//   REALTIMEKIT_PRESET_HOST=group_call_host
//   REALTIMEKIT_PRESET_LISTENER=group_call_participant
import fs from "node:fs";

function env(key) {
  const fromProc = process.env[key];
  if (fromProc) return fromProc;
  if (!fs.existsSync(".env")) return undefined;
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

const ACCOUNT = env("CLOUDFLARE_ACCOUNT_ID");
const TOKEN = env("CLOUDFLARE_API_TOKEN");
const APP_NAME = env("REALTIMEKIT_APP_NAME") || "watchparty";
const PRESET_HOST = env("REALTIMEKIT_PRESET_HOST") || "group_call_host";
const PRESET_LISTENER = env("REALTIMEKIT_PRESET_LISTENER") || "group_call_participant";

if (!ACCOUNT || !TOKEN) {
  console.error("Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN in .env");
  process.exit(1);
}

const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/realtime/kit`;
const headers = { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" };

async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.success === false) {
    throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(json.errors ?? json)}`);
  }
  // RealtimeKit wraps payloads in `data`.
  return json.data ?? json.result ?? json;
}

const asArray = (r) => (Array.isArray(r) ? r : Array.isArray(r?.data) ? r.data : r ? [r] : []);

async function main() {
  console.log(`Account: ${ACCOUNT}\nLooking for RealtimeKit app "${APP_NAME}"…\n`);

  // 1. Find or create the app.
  let app;
  try {
    const apps = asArray(await call("GET", "/apps"));
    app = apps.find((a) => (a.name ?? a.title) === APP_NAME) ?? apps[0];
    if (app) console.log(`Found existing app: ${app.name ?? app.title} (${app.id})`);
  } catch (e) {
    console.log(`(list apps failed, will try create) ${e.message}`);
  }
  if (!app) {
    const created = await call("POST", "/apps", { name: APP_NAME });
    app = created.app ?? created; // create wraps the app under data.app
    console.log(`Created app: ${app.name ?? APP_NAME} (${app.id})`);
  }
  const appId = app.id;
  if (!appId) throw new Error("Could not determine app id from response");

  // 2. Check presets.
  let presetNames = [];
  try {
    const presets = asArray(await call("GET", `/${appId}/presets`));
    presetNames = presets.map((p) => p.name).filter(Boolean);
    console.log(`\nPresets on app: ${presetNames.length ? presetNames.join(", ") : "(none)"}`);
  } catch (e) {
    console.log(`\n(could not list presets) ${e.message}`);
  }

  const haveHost = presetNames.includes(PRESET_HOST);
  const haveListener = presetNames.includes(PRESET_LISTENER);
  console.log(`  speaker preset "${PRESET_HOST}": ${haveHost ? "OK" : "MISSING"}`);
  console.log(`  listener preset "${PRESET_LISTENER}": ${haveListener ? "OK" : "MISSING"}`);

  console.log("\n────────────────────────────────────────");
  console.log("Add to .env.production (then re-upload DOTENV_PRODUCTION + deploy):\n");
  console.log(`CLOUDFLARE_REALTIME_APP_ID=${appId}`);
  console.log(`CLOUDFLARE_REALTIME_API_TOKEN=<a token with Realtime perms — can be the same CLOUDFLARE_API_TOKEN>`);
  if (!haveHost || !haveListener) {
    console.log(
      `\n⚠️  Missing preset(s). Create them in the RealtimeKit dashboard (or set\n` +
        `   REALTIMEKIT_PRESET_HOST / REALTIMEKIT_PRESET_LISTENER to presets that exist).\n` +
        `   Speaker preset must allow publishing audio; listener = receive-only.`,
    );
  }
}

main().catch((e) => {
  console.error("\nProvisioning failed:", e.message);
  process.exit(1);
});
