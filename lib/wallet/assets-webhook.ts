import { db } from "@/db";
import { user } from "@/db/schema/auth/user";
import { isNotNull } from "drizzle-orm";
import { webhookIsCurrent } from "@/lib/helius/webhook-edit";

/**
 * Helius address webhook for wallet assets ("rung 2" of the indexer ladder):
 * Helius calls /api/webhooks/helius-assets whenever a watched wallet is part
 * of a transaction; the receiver busts the SWR'd assets cache and nudges the
 * client over Supabase realtime — so external deposits show up in seconds
 * without polling harder.
 *
 * This module holds the registration/sync side: one Helius webhook (keyed by
 * its URL, so re-running is idempotent) watching every linked wallet address.
 * Re-sync picks up users who linked wallets since the last run — wired to
 * both the setup script and the daily cron.
 */

export function heliusApiKey(): string {
    if (process.env.HELIUS_API_KEY) return process.env.HELIUS_API_KEY;
    const rpc = process.env.HELIUS_RPC_URL ?? process.env.NEXT_PUBLIC_HELIUS_RPC_URL ?? "";
    const m = rpc.match(/api-key=([^&]+)/);
    if (m) return m[1];
    throw new Error("Set HELIUS_API_KEY (or HELIUS_RPC_URL with ?api-key=).");
}

// Helius caps one webhook at 100k addresses; leave headroom before this
// needs sharding across multiple webhooks.
const MAX_ADDRESSES = 90_000;

export async function syncAssetsWebhook(): Promise<{ webhookID: string; watching: number; created: boolean }> {
    const apiKey = heliusApiKey();
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_AUTH_URL;
    if (!base) throw new Error("Set NEXT_PUBLIC_BASE_URL to the prod domain.");
    const webhookURL = `${base.replace(/\/$/, "")}/api/webhooks/helius-assets`;

    const rows = await db
        .select({ address: user.wallet_address })
        .from(user)
        .where(isNotNull(user.wallet_address));

    const accountAddresses = [...new Set(rows.map((r) => r.address).filter(Boolean) as string[])].slice(0, MAX_ADDRESSES);
    if (!accountAddresses.length) throw new Error("No linked wallet addresses to watch.");

    const payload = {
        webhookURL,
        transactionTypes: ["ANY"],
        accountAddresses,
        webhookType: "enhanced",
        ...(process.env.HELIUS_WEBHOOK_SECRET ? { authHeader: process.env.HELIUS_WEBHOOK_SECRET } : {}),
    };

    // Reuse the existing webhook for this URL if present (idempotent sync).
    const list = await (await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`)).json();
    const existing = Array.isArray(list)
        ? list.find((w: { webhookURL?: string }) => w.webhookURL === webhookURL)
        : null;

    // 100 credits per edit, 0 to read — so compare before writing. See
    // lib/helius/webhook-edit.ts for what unconditional PUTs were costing.
    if (existing && await webhookIsCurrent(apiKey, existing.webhookID, accountAddresses, payload.transactionTypes as string[])) {
        return { webhookID: existing.webhookID, watching: accountAddresses.length, created: false };
    }

    const res = existing
        ? await fetch(`https://api.helius.xyz/v0/webhooks/${existing.webhookID}?api-key=${apiKey}`, {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
          })
        : await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${apiKey}`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(payload),
          });

    const out = await res.json();
    if (!res.ok) throw new Error(`Helius API error: ${JSON.stringify(out)}`);
    return { webhookID: out.webhookID, watching: accountAddresses.length, created: !existing };
}
