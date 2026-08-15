"use client";

// Dexscreener-style live price in the browser tab: `$0.6183 · WIF`.
// Renders nothing.
//
// The price is derived from `trade.coinTrades` — the SAME query, key and
// options CoinDetail's tape and bubbles already run on this page. That is the
// whole trick: react-query dedupes the observers, so the tab title costs ZERO
// extra requests. Mobula's free plan 429s about half of these already (see
// TRADES_STALE_SECONDS), so a dedicated price poll was not an option.
//
// Actual freshness is governed server-side by mobulaCadence().tradesTtl behind
// an SWR cache; the 15s poll just picks up new windows promptly and is nearly
// always answered from Redis.
//
// Composes with TabNotificationBadge: this writes a clean title, and the badge's
// MutationObserver re-prepends `(N) ` on top of it.

import { useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { retryTransient } from "@/lib/query-retry";
import { tokenPrice } from "@/components/trending/trending-format";

export function CoinTabPrice({
    network,
    address,
    symbol,
    fallbackPriceUsd,
}: {
    network: string;
    address: string;
    symbol: string | null;
    fallbackPriceUsd: number | null;
}) {
    const { data: trades = [] } = trpc.trade.coinTrades.useQuery(
        { network, address },
        { staleTime: 10_000, refetchInterval: 15_000, retry: retryTransient(1) },
    );

    // Newest usable trade by TIMESTAMP rather than array position — the tape is
    // provider-ordered and a positional assumption would silently show a stale
    // price the day that changes.
    const livePrice = useMemo(() => {
        let price: number | null = null;
        let newest = -Infinity;
        for (const t of trades) {
            if (t.ts > newest && t.tokenAmount > 0 && t.usdValue > 0) {
                newest = t.ts;
                price = t.usdValue / t.tokenAmount;
            }
        }
        return price;
    }, [trades]);

    // Falls back to the server-rendered price, so an illiquid coin with no
    // recent trades still gets a title rather than nothing.
    const price = livePrice ?? fallbackPriceUsd;

    useEffect(() => {
        if (price == null || !Number.isFinite(price) || price <= 0) return;
        document.title = symbol ? `${tokenPrice(price)} · ${symbol}` : tokenPrice(price);
    }, [price, symbol]);

    return null;
}
