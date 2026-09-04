// Helius webhook watching the wallets of trade-sharing users, so trades made
// OUTSIDE the app (Jupiter, Photon, Axiom…) still land in the `trades` ledger
// and count toward PnL + follower signals (docs/exp-callouts.md §4a-2).
//
// Same idempotent registration pattern as lib/tokens/trades-webhook.ts (keyed
// on webhook URL). Receiver: /api/webhooks/helius-user-trades. Synced when a
// user toggles sharing and self-heals via the daily webhook-sync cron.
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { linkedWallets } from "@/db/schema/auth/linked-wallets";
import { eq, and, isNotNull, or, isNull, ne } from "drizzle-orm";
import { heliusApiKey } from "@/lib/wallet/assets-webhook";
import { webhookIsCurrent } from "@/lib/helius/webhook-edit";
import { heliusWebhookSecret } from "@/lib/helius/webhook-secret";

const MAX_ADDRESSES = 90_000;

export async function syncUserTradesWebhook(): Promise<{ webhookID: string; watching: number; created: boolean }> {
    const apiKey = heliusApiKey();
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXT_PUBLIC_AUTH_URL;
    if (!base) throw new Error("Set NEXT_PUBLIC_BASE_URL to the prod domain.");
    const webhookURL = `${base.replace(/\/$/, "")}/api/webhooks/helius-user-trades`;

    // EVERY Solana wallet on each sharing account, not just the primary.
    //
    // This used to read `user.wallet_address`, which mirrors only the PRIMARY of
    // up to 15 linked wallets. A user who opted into sharing and then traded
    // from any of their others was simply not watched — the trades never
    // arrived, so there was nothing to debug and nothing to notice. The
    // receiver had the same bug on the matching side, so the two agreed with
    // each other while both being wrong.
    //
    // `chain_kind` NULL is the generated multichain wallet, whose
    // `linked_wallets.address` IS its Solana address; "solana" is an external
    // one. EVM rows are excluded because Helius watches Solana.
    const [linked, legacy] = await Promise.all([
        db
            .select({ wallet: linkedWallets.address })
            .from(linkedWallets)
            .innerJoin(user, eq(linkedWallets.user_id, user.id))
            .where(and(
                eq(user.shareTrades, true),
                or(isNull(linkedWallets.chain_kind), eq(linkedWallets.chain_kind, "solana")),
            )),
        // Accounts that predate linked_wallets still have only the mirror.
        db
            .select({ wallet: user.wallet_address })
            .from(user)
            .where(and(eq(user.shareTrades, true), isNotNull(user.wallet_address))),
    ]);

    const accountAddresses = [
        ...new Set([...linked, ...legacy].map((r) => r.wallet).filter(Boolean) as string[]),
    ].slice(0, MAX_ADDRESSES);
    if (!accountAddresses.length) {
        return { webhookID: "", watching: 0, created: false }; // nobody sharing yet
    }

    // SWAP only: unlike the pool webhook (which needs ANY for DBC curve txs),
    // external venues are aggregator swaps Helius classifies correctly, and
    // wallets see tons of non-trade traffic we don't want delivered.
    const payload = {
        webhookURL,
        transactionTypes: ["SWAP"],
        accountAddresses,
        webhookType: "enhanced",
        ...(heliusWebhookSecret() ? { authHeader: heliusWebhookSecret() } : {}),
    };

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
    if (!res.ok) throw new Error(`Helius user-trades webhook sync failed: ${res.status} ${await res.text()}`);
    const saved = await res.json() as { webhookID: string };
    return { webhookID: saved.webhookID, watching: accountAddresses.length, created: !existing };
}
