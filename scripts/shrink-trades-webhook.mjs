// EMERGENCY: scope the Helius trades webhook back down.
//
// Registering 313 pools made /api/webhooks/helius-trades take ~32 requests a
// SECOND. Each delivery ran two Drizzle queries against a 15-connection pool,
// which exhausted it, produced "Worker exceeded memory limit", and degraded
// unrelated parts of the site. Run this to stop the flood now; the code fix
// (cached pool map + a hard cap) follows on the next deploy.
//
//   node scripts/shrink-trades-webhook.mjs          # scope down to 15 pools
//   node scripts/shrink-trades-webhook.mjs 0        # pause it entirely
//
// Re-widening happens on the next /api/cron/sync-assets-webhook run, so don't
// trigger that until the deploy carrying the cap has landed.

import { readFileSync } from "node:fs";

const env = Object.fromEntries(
    readFileSync(".env", "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);

const key =
    env.HELIUS_API_KEY ||
    (env.NEXT_PUBLIC_HELIUS_MAINNET_RPC_URL || env.NEXT_PUBLIC_HELIUS_RPC_URL || "").split("api-key=")[1];
if (!key) {
    console.error("No Helius API key in .env (HELIUS_API_KEY or a *_HELIUS_*_RPC_URL with api-key=).");
    process.exit(1);
}

const limit = Number(process.argv[2] ?? 15);

const list = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${key}`).then((r) => r.json());
const hook = (Array.isArray(list) ? list : []).find((w) => String(w.webhookURL || "").includes("helius-trades"));
if (!hook) {
    console.error("No webhook whose URL contains 'helius-trades'.");
    process.exit(1);
}

console.log(`webhook ${hook.webhookID} currently watching ${hook.accountAddresses?.length ?? 0} addresses`);

const keep = (hook.accountAddresses ?? []).slice(0, limit);
const res = await fetch(`https://api.helius.xyz/v0/webhooks/${hook.webhookID}?api-key=${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        webhookURL: hook.webhookURL,
        transactionTypes: hook.transactionTypes,
        accountAddresses: keep,
        webhookType: hook.webhookType,
        ...(hook.authHeader ? { authHeader: hook.authHeader } : {}),
    }),
});

console.log(res.ok ? `OK — now watching ${keep.length}` : `FAILED ${res.status}: ${(await res.text()).slice(0, 200)}`);
