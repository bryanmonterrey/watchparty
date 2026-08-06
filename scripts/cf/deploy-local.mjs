// Local deploy of the already-built OpenNext worker — the emergency path for
// when GitHub Actions is down (first used 2026-08-06, Actions major outage).
// Replicates the deploy step of .github/workflows/deploy.yml:
//   - CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID from .env
//   - CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE so miniflare can
//     instantiate the Hyperdrive binding pre-upload (points at DATABASE_URL)
// Run AFTER `bun run cf:build`, with .env holding PRODUCTION values (next build
// bakes NEXT_PUBLIC_* — a dev .env produces a broken deploy).
// Does NOT push runtime secrets (they persist on the worker across deploys).
import fs from "node:fs";
import { spawnSync } from "node:child_process";

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

const token = envVal("CLOUDFLARE_API_TOKEN");
const account = envVal("CLOUDFLARE_ACCOUNT_ID");
const dbUrl = envVal("DATABASE_URL");
if (!token || !account || !dbUrl) throw new Error("need CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, DATABASE_URL in .env");

const res = spawnSync("npx", ["wrangler", "deploy"], {
  stdio: "inherit",
  env: {
    ...process.env,
    CLOUDFLARE_API_TOKEN: token,
    CLOUDFLARE_ACCOUNT_ID: account,
    CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: dbUrl,
  },
});
process.exit(res.status ?? 1);
