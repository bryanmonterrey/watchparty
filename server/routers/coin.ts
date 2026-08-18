import { z } from "zod";
import { router, publicProcedure } from "@/server/trpc";
import { resolveCoin } from "@/lib/coins/resolve";

// Live market stats for the coin page header.
//
// The header used to render straight off the server-resolved prop, so price,
// market cap, change, volume and liquidity were frozen at page render while the
// trades table and chart beneath them refreshed every 15s — the numbers people
// actually watch were the only ones that never moved.
//
// Cheap to poll: `resolveCoin` reads `trending_coins` from our own database
// rather than calling an upstream, and the sync crons are what keep that row
// fresh. So this is a DB read per tick, not a metered API call per viewer.
//
// Its own router because trade.ts sits at 991 lines against a 1000-line guard.
export const coinRouter = router({
    /** Just the numbers that move. The identity fields (name, image, address)
     *  cannot change under a mounted page, so re-sending them every 15s would
     *  be payload for nothing. */
    stats: publicProcedure
        .input(z.object({ network: z.string(), tokenAddress: z.string() }))
        .query(async ({ input }) => {
            const coin = await resolveCoin(input.tokenAddress, input.network);
            if (!coin) return null;
            return {
                priceUsd: coin.priceUsd,
                marketCapUsd: coin.marketCapUsd,
                liquidityUsd: coin.liquidityUsd,
                volume24hUsd: coin.volume24hUsd,
                priceChange24h: coin.priceChange24h,
                buys24h: coin.buys24h,
                sells24h: coin.sells24h,
                txns24h: coin.txns24h,
            };
        }),
});
