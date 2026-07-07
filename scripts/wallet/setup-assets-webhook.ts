/**
 * Register (or re-sync) the Helius webhook that watches every linked user
 * wallet and POSTs to /api/webhooks/helius-assets (cache bust + realtime
 * nudge on deposits/sends).
 *
 * Run:  bun run scripts/wallet/setup-assets-webhook.ts
 * Needs: HELIUS_API_KEY (or NEXT_PUBLIC_HELIUS_RPC_URL with ?api-key=),
 *        NEXT_PUBLIC_BASE_URL (prod domain), DATABASE_URL.
 *        Optional: HELIUS_WEBHOOK_SECRET (auth header the receiver checks).
 *
 * The daily cron /api/cron/sync-assets-webhook runs the same sync to pick up
 * newly linked wallets.
 */
import { syncAssetsWebhook } from "@/lib/wallet/assets-webhook";

async function main() {
    const { webhookID, watching, created } = await syncAssetsWebhook();
    console.log(`✓ ${created ? "created" : "updated"} webhook ${webhookID}`);
    console.log(`   watching ${watching} wallet address(es)`);
    process.exit(0);
}

main().catch((e) => {
    console.error(e?.message ?? e);
    process.exit(1);
});
