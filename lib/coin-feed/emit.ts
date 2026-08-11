// Writers for the NATIVE event kinds — the watchparty-side things that belong
// in the alert rail alongside on-chain clusters: callouts, prediction markets,
// launches, migrations.
//
// Why write rows instead of unioning at read time: the rail paginates on one
// (occurred_at, id) keyset cursor and restores items when you scroll back up.
// A read-time UNION across four tables cannot be cursored coherently — every
// page would have to re-sort four sources and the window's edges would drift.
// One append-only table keeps the cursor total and the scroll honest.
//
// Every helper here is best-effort: an alert failing to write must never fail
// the user action that produced it.

import { db } from "@/db";
import { coinFeedEvents, type NewCoinFeedEvent } from "@/db/schema/content/coin-feed";
import { nanoid } from "nanoid";
import { dispatchDeveloperEvent } from "@/lib/developer/webhooks";
import { deliverCommunityCoinAlerts } from "@/lib/coin-feed/community-alerts";

/** Insert events, ignoring any whose dedupeKey already landed. */
export async function emitCoinFeedEvents(rows: NewCoinFeedEvent[]): Promise<number> {
    if (rows.length === 0) return 0;
    try {
        await db.insert(coinFeedEvents).values(rows).onConflictDoNothing({ target: coinFeedEvents.dedupeKey });
        // Bot-managed community coin alerts ride the same write (best-effort;
        // never blocks or fails the emit).
        void deliverCommunityCoinAlerts(rows);
        return rows.length;
    } catch (err) {
        console.error("[coin-feed] emit failed:", err);
        return 0;
    }
}

type TokenSnapshot = {
    /** tokens.id — a watchparty launch. */
    wpTokenId: string;
    tokenAddress: string | null;
    ticker: string;
    imageUrl: string | null;
    marketCapUsd: number | null;
};

/** Someone called a coin. Fired from callout.create. */
export function emitCalloutEvent(opts: {
    calloutId: string;
    userId: string;
    token: TokenSnapshot;
    occurredAt?: Date;
}): Promise<number> {
    return emitCoinFeedEvents([
        {
            id: nanoid(),
            kind: "callout",
            network: "solana",
            wpTokenId: opts.token.wpTokenId,
            tokenAddress: opts.token.tokenAddress,
            symbol: opts.token.ticker.toUpperCase(),
            tokenImageUrl: opts.token.imageUrl,
            traderCount: 1,
            marketCapUsd: opts.token.marketCapUsd,
            actorId: opts.userId,
            refId: opts.calloutId,
            dedupeKey: `callout:${opts.calloutId}`,
            occurredAt: opts.occurredAt ?? new Date(),
        },
    ]);
}

/** A prediction market opened. Fired from the AI factory and manual creation. */
export function emitPredictionEvent(opts: {
    marketId: string;
    question: string;
    category?: string | null;
    creatorId?: string | null;
    imageUrl?: string | null;
    occurredAt?: Date;
}): Promise<number> {
    return emitCoinFeedEvents([
        {
            id: nanoid(),
            kind: "prediction",
            network: "solana",
            // No coin attached — symbol carries the category so the rail's
            // filter and its badge have something consistent to read.
            symbol: (opts.category ?? "general").toLowerCase(),
            tokenImageUrl: opts.imageUrl ?? null,
            title: opts.question,
            actorId: opts.creatorId ?? null,
            refId: opts.marketId,
            dedupeKey: `prediction:${opts.marketId}`,
            occurredAt: opts.occurredAt ?? new Date(),
        },
    ]);
}

/** A watchparty coin went live (bonding curve deployed). */
export function emitLaunchEvent(opts: { token: TokenSnapshot; creatorId?: string | null }): Promise<number> {
    // The creator's developer webhook, if subscribed. Best-effort like
    // everything in this file; the launch flow never waits on delivery.
    if (opts.creatorId) {
        void dispatchDeveloperEvent(opts.creatorId, "coin.launched", {
            tokenId: opts.token.wpTokenId,
            tokenAddress: opts.token.tokenAddress,
            ticker: opts.token.ticker.toUpperCase(),
            imageUrl: opts.token.imageUrl,
        });
    }
    return emitCoinFeedEvents([
        {
            id: nanoid(),
            kind: "launch",
            network: "solana",
            wpTokenId: opts.token.wpTokenId,
            tokenAddress: opts.token.tokenAddress,
            symbol: opts.token.ticker.toUpperCase(),
            tokenImageUrl: opts.token.imageUrl,
            marketCapUsd: opts.token.marketCapUsd,
            actorId: opts.creatorId ?? null,
            dedupeKey: `launch:${opts.token.wpTokenId}`,
            occurredAt: new Date(),
        },
    ]);
}

/** A watchparty coin completed its bonding curve. */
export function emitMigrationEvent(opts: { token: TokenSnapshot }): Promise<number> {
    return emitCoinFeedEvents([
        {
            id: nanoid(),
            kind: "migration",
            network: "solana",
            wpTokenId: opts.token.wpTokenId,
            tokenAddress: opts.token.tokenAddress,
            symbol: opts.token.ticker.toUpperCase(),
            tokenImageUrl: opts.token.imageUrl,
            marketCapUsd: opts.token.marketCapUsd,
            dedupeKey: `migration:${opts.token.wpTokenId}`,
            occurredAt: new Date(),
        },
    ]);
}
