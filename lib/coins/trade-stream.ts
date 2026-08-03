"use client";

import { getRealtimeClient } from "@/lib/supabase/realtime-client";

/**
 * The shape the transactions table renders — identical to what
 * `wallet.getTokenTrades` returns, so a streamed row and a fetched row are
 * interchangeable and the table needs no branching.
 */
export type LiveTrade = {
    account: string;
    username: string | null;
    avatarUrl: string | null;
    isBuy: boolean;
    usdValue: number;
    tokenAmount: number;
    ts: number;
    txHash: string;
};

type TradeRow = {
    network: string;
    pool_address: string;
    token_address: string;
    signature: string;
    ts: number | string;
    trader: string;
    side: string;
    amount_token: number | string | null;
    amount_usd: number | string | null;
};

/**
 * Push swaps into an open transactions table as they confirm.
 *
 * Replaces a 30-second poll sitting behind a 30-second server cache — up to a
 * minute of lag, on an upstream that rate-limits our egress and often returned
 * nothing at all. Rows now arrive ~1-2s after the swap lands, which is what a
 * DEX transaction tape is supposed to look like.
 *
 * Filters on token rather than pool so the table works when opened by mint,
 * before any pool is known — the same reason coin_trades carries both.
 */
export function subscribeTrades(
    network: string,
    tokenAddress: string,
    onTrade: (trade: LiveTrade) => void,
): () => void {
    const client = getRealtimeClient();

    const channel = client
        .channel(`trades:${network}:${tokenAddress}`)
        .on(
            "postgres_changes",
            {
                event: "INSERT",
                schema: "public",
                table: "coin_trades",
                filter: `token_address=eq.${tokenAddress}`,
            },
            (payload) => {
                const row = payload.new as TradeRow | undefined;
                if (!row || row.network !== network) return;

                // Postgres hands bigint and numeric back as STRINGS over the
                // wire. Coercing here is not defensive tidiness — string values
                // silently break sorting and formatting downstream, which is
                // exactly the bug that left charts stuck on a loading spinner.
                const ts = Number(row.ts);
                const tokenAmount = row.amount_token === null ? 0 : Number(row.amount_token);
                const usdValue = row.amount_usd === null ? 0 : Number(row.amount_usd);

                onTrade({
                    account: row.trader,
                    // Resolving a wallet to a watchparty profile needs a server
                    // lookup we deliberately don't make per row — the tape must
                    // stay cheap. The next refetch fills identities in.
                    username: null,
                    avatarUrl: null,
                    isBuy: row.side === "buy",
                    usdValue,
                    tokenAmount,
                    ts,
                    txHash: row.signature,
                });
            },
        )
        .subscribe();

    return () => {
        void client.removeChannel(channel);
    };
}
