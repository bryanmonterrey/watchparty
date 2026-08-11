// Delivery for bot-managed community coin alerts (MANAGE_COIN_ALERTS).
// Called best-effort from BOTH coin_feed_events writers (emit.ts and
// clusters.ts) right after their insert: match new events against standing
// community_coin_alerts rows and post a message into each alerted channel as
// the bot that created the alert.
//
// Guard rails, in order:
// - The alert's bot must STILL hold MANAGE_COIN_ALERTS in that community at
//   delivery time (revoking the bit or evicting the bot silences its alerts
//   instantly — the rows aren't trusted after the grant changes).
// - Best-effort end to end: a delivery failure never touches the event write.
// - Volume is naturally bounded: alerts are per-(channel, token, bot) unique,
//   capped per server at create time, and events are deduped upstream.

import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { communityCoinAlerts } from "@/db/schema/community";
import { developerBotInstalls } from "@/db/schema/content/developer-bot-install";
import type { NewCoinFeedEvent } from "@/db/schema/content/coin-feed";
import { BOT_PERMISSIONS, hasPermission } from "@/lib/developer/bot-permissions";
import { postAsBot } from "@/lib/developer/bot-community";

const KIND_LABEL: Record<string, string> = {
    cluster_buy: "cluster buy",
    cluster_sell: "cluster sell",
    whale_buy: "whale buy",
    whale_sell: "whale sell",
    launch: "launched",
    migration: "completed its bonding curve",
    callout: "was called out",
    prediction: "prediction opened",
};

function formatAlert(ev: NewCoinFeedEvent): string {
    const symbol = ev.symbol ? `$${ev.symbol.toUpperCase()}` : (ev.tokenAddress ?? "a tracked token");
    const label = KIND_LABEL[ev.kind] ?? ev.kind;
    const cap =
        typeof ev.marketCapUsd === "number" && Number.isFinite(ev.marketCapUsd)
            ? ` — market cap $${Math.round(ev.marketCapUsd).toLocaleString("en-US")}`
            : "";
    return `🔔 Coin alert: ${symbol} ${label}${cap}`;
}

export async function deliverCommunityCoinAlerts(rows: NewCoinFeedEvent[]): Promise<void> {
    try {
        const addresses = [...new Set(rows.map((r) => r.tokenAddress).filter((a): a is string => !!a))];
        if (!addresses.length) return;

        const alerts = await db
            .select({
                id: communityCoinAlerts.id,
                serverId: communityCoinAlerts.serverId,
                channelId: communityCoinAlerts.channelId,
                tokenAddress: communityCoinAlerts.tokenAddress,
                kinds: communityCoinAlerts.kinds,
                botUserId: communityCoinAlerts.createdByBotUserId,
            })
            .from(communityCoinAlerts)
            .where(inArray(communityCoinAlerts.tokenAddress, addresses));
        if (!alerts.length) return;

        // Grant re-check, one query for all involved bots.
        const botIds = [...new Set(alerts.map((a) => a.botUserId))];
        const installs = await db
            .select({
                botUserId: developerBotInstalls.botUserId,
                serverId: developerBotInstalls.serverId,
                permissions: developerBotInstalls.permissions,
            })
            .from(developerBotInstalls)
            .where(inArray(developerBotInstalls.botUserId, botIds));
        const granted = new Set(
            installs
                .filter((i) => hasPermission(i.permissions, BOT_PERMISSIONS.MANAGE_COIN_ALERTS))
                .map((i) => `${i.botUserId}:${i.serverId}`),
        );

        for (const ev of rows) {
            if (!ev.tokenAddress) continue;
            for (const alert of alerts) {
                if (alert.tokenAddress !== ev.tokenAddress) continue;
                if (alert.kinds.length > 0 && !alert.kinds.includes(ev.kind)) continue;
                if (!granted.has(`${alert.botUserId}:${alert.serverId}`)) continue;
                await postAsBot(alert.botUserId, alert.serverId, alert.channelId, formatAlert(ev));
            }
        }
    } catch (err) {
        console.error("[coin-alerts] community delivery failed:", err);
    }
}
