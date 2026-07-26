// Formatting + presentation metadata for coin alert rows.
//
// Kept out of the row component so the rail, the filter panel and the row all
// read the same source for what a kind is called and what colour it carries.

import type { CoinFeedKind } from "@/db/schema/content/coin-feed";
import { networkById } from "@/lib/coin-feed/networks";

/** $40.3K / $7M / $612 — the rail is 280px wide, so compact is mandatory. */
export function formatUsd(n: number | null | undefined): string {
    if (n == null || !Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1)}B`;
    if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
    if (abs >= 1_000) return `$${(n / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
    return `$${Math.round(n)}`;
}

/** 5m / 37m / 1h / 2d — matches the reference's right-aligned age column. */
export function formatAge(at: Date | string): string {
    const then = typeof at === "string" ? new Date(at) : at;
    const secs = Math.max(0, (Date.now() - then.getTime()) / 1000);
    if (secs < 60) return "now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return `${Math.floor(days / 7)}w`;
}

export type KindMeta = {
    /** Lowercase label for the filter panel. */
    label: string;
    /** Badge text on the row, null for kinds that don't carry a buy/sell chip. */
    badge: string | null;
    /** "up" tints jewel green, "down" tints pastel red, "neutral" stays muted. */
    tone: "up" | "down" | "neutral";
};

export const KIND_META: Record<CoinFeedKind, KindMeta> = {
    cluster_buy: { label: "trader buys", badge: "buy", tone: "up" },
    cluster_sell: { label: "trader sells", badge: "sell", tone: "down" },
    whale_buy: { label: "whale buys", badge: "buy", tone: "up" },
    whale_sell: { label: "whale sells", badge: "sell", tone: "down" },
    launch: { label: "launches", badge: "new", tone: "neutral" },
    migration: { label: "migrations", badge: "migrated", tone: "up" },
    callout: { label: "callouts", badge: "call", tone: "neutral" },
    prediction: { label: "predictions", badge: "market", tone: "neutral" },
};

/** Groups shown in the filter panel — kinds are toggled a group at a time,
 *  because "clusters" vs "whales" is the distinction anyone actually wants. */
export const KIND_GROUPS: { key: string; label: string; kinds: CoinFeedKind[] }[] = [
    { key: "clusters", label: "trader clusters", kinds: ["cluster_buy", "cluster_sell"] },
    { key: "whales", label: "whale trades", kinds: ["whale_buy", "whale_sell"] },
    { key: "lifecycle", label: "launches + migrations", kinds: ["launch", "migration"] },
    { key: "callouts", label: "callouts", kinds: ["callout"] },
    { key: "predictions", label: "predictions", kinds: ["prediction"] },
];

export type AlertLinkTarget = { href: string; external: boolean };

/**
 * Where a row goes when clicked.
 *
 * Coins we launched get the native coin page. Coins we only TRACK have no page
 * here — sending those to a search that returns nothing would be a dead end, so
 * they open the chain's explorer in a new tab instead.
 */
export function alertHref(event: {
    kind: CoinFeedKind;
    network: string;
    wpTokenId: string | null;
    tokenAddress: string | null;
    refId: string | null;
}): AlertLinkTarget | null {
    if (event.kind === "prediction") {
        return event.refId ? { href: `/trade/predictions/${event.refId}`, external: false } : { href: "/trade/predictions", external: false };
    }
    if (event.kind === "callout") {
        // Callouts always name one of our coins; prefer the coin page and fall
        // back to the callouts board.
        if (event.tokenAddress || event.wpTokenId) {
            return { href: `/${event.tokenAddress ?? event.wpTokenId}`, external: false };
        }
        return { href: "/trade/callouts", external: false };
    }
    // Only coins we LAUNCHED have a page here — /[slug] resolves against the
    // `tokens` table, so sending a merely-tracked mint there 404s.
    if (event.wpTokenId) {
        return { href: `/${event.tokenAddress ?? event.wpTokenId}`, external: false };
    }
    const explorer = event.tokenAddress ? networkById(event.network)?.explorerTokenUrl : undefined;
    return explorer && event.tokenAddress ? { href: explorer(event.tokenAddress), external: true } : null;
}
