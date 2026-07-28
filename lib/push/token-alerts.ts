// Coin notification triggers — called from the market-sync passes (both the
// per-minute sweep and the instant per-token syncToken path). Two alerts,
// matching the token page's promise: price moves and migration.
//
// Price: fires on a ≥20% move from the baseline (price at the last alert),
// at most once per hour per token. The baseline is stamped silently on first
// observation so a token's very first sync never alerts.
import { db } from "@/db";
import { tokens, tokenAlertSubscriptions } from "@/db/schema/content/token";
import { eq } from "drizzle-orm";
import { sendPushToUsers, pushConfigured } from "@/lib/push/send";

export const PRICE_ALERT_THRESHOLD = 0.2; // 20%
export const PRICE_ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1h

export type AlertableToken = {
    id: string;
    tokenAddress: string | null;
    name: string;
    ticker: string;
    lastAlertPriceUsd: number | null;
    lastAlertAt: Date | null;
};

async function subscriberIds(tokenId: string): Promise<string[]> {
    const rows = await db
        .select({ userId: tokenAlertSubscriptions.userId })
        .from(tokenAlertSubscriptions)
        .where(eq(tokenAlertSubscriptions.tokenId, tokenId));
    return rows.map((r) => r.userId);
}

const tokenUrl = (t: AlertableToken) => `/coin/${t.tokenAddress ?? t.id}`;

const fmtPrice = (p: number) =>
    p >= 1 ? `$${p.toFixed(2)}` : `$${p.toPrecision(3).replace(/0+$/, "").replace(/\.$/, "")}`;

/** Check/fire a price alert after a sync wrote a fresh price. */
export async function maybePriceAlert(token: AlertableToken, newPrice: number | null): Promise<void> {
    if (newPrice == null || newPrice <= 0 || !pushConfigured()) return;

    // First observation: stamp the baseline silently.
    if (token.lastAlertPriceUsd == null || token.lastAlertPriceUsd <= 0) {
        await db.update(tokens).set({ lastAlertPriceUsd: newPrice }).where(eq(tokens.id, token.id));
        return;
    }

    const change = (newPrice - token.lastAlertPriceUsd) / token.lastAlertPriceUsd;
    if (Math.abs(change) < PRICE_ALERT_THRESHOLD) return;
    if (token.lastAlertAt && Date.now() - token.lastAlertAt.getTime() < PRICE_ALERT_COOLDOWN_MS) return;

    // Move the baseline BEFORE fanning out — if two sync paths race, the
    // second sees the fresh baseline and stays quiet.
    await db
        .update(tokens)
        .set({ lastAlertPriceUsd: newPrice, lastAlertAt: new Date() })
        .where(eq(tokens.id, token.id));

    const users = await subscriberIds(token.id);
    if (users.length === 0) return;

    const pct = Math.abs(change * 100).toFixed(0);
    await sendPushToUsers(users, {
        title: `$${token.ticker} ${change > 0 ? "▲ up" : "▼ down"} ${pct}%`,
        body: `${token.name} is now ${fmtPrice(newPrice)}`,
        url: tokenUrl(token),
        tag: `price-${token.id}`,
    });
}

/** Fire the one-time migration alert when a token graduates off the curve. */
export async function migrationAlert(token: AlertableToken): Promise<void> {
    if (!pushConfigured()) return;
    const users = await subscriberIds(token.id);
    if (users.length === 0) return;

    await sendPushToUsers(users, {
        title: `$${token.ticker} graduated 🎓`,
        body: `${token.name} completed its bonding curve and now trades on the open market`,
        url: tokenUrl(token),
        tag: `migration-${token.id}`,
    });
}
