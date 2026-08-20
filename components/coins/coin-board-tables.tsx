"use client";

// The two board tabs that were never built.
//
// `CoinTable` had a tab row — Holders / Swaps / Tags — whose state changed
// nothing but the active label's colour. All three rendered the same folded
// trader table, so the tabs looked functional and quietly lied: a "Swaps" tab
// showing one row per TRADER is not a list of swaps.
//
// Both live here rather than in coin-detail.tsx because that file is at 944 of
// the guard's 1000 lines, and because they are genuinely separate views over
// the same fetch — the trader fold, the raw tape, and the posts. No new query:
// swaps are the `trade.coinTrades` rows before folding, mentions are the
// `tags.forCoin` rows the chart overlay already loads.

import * as React from "react";
import { DataTable, createDataTableColumnHelper } from "@/components/ui/data-table";
import { stableHoverColor } from "@/lib/stable-hover-color";
import { formatRelativeTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { explorerTxUrl } from "@/lib/coin-feed/networks";

/** One swap, exactly as `trade.coinTrades` returns it. */
export interface SwapRow {
    account: string;
    username: string | null;
    avatarUrl: string | null;
    isBuy: boolean;
    usdValue: number;
    tokenAmount: number;
    /** Execution price at the fill; null when the provider didn't carry one. */
    priceUsd: number | null;
    /** Unix SECONDS — the tape's unit everywhere (coin_trades, candles, tags). */
    ts: number;
    txHash: string;
}

/** One post that wrote this coin's ticker, as `tags.forCoin` returns it. */
export interface MentionRow {
    id: string;
    ts: number;
    username: string | null;
    avatarUrl: string | null;
    text: string | null;
}

const usd = (n: number) =>
    n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000 ? `$${(n / 1_000).toFixed(1)}K`
    : n >= 1 ? `$${n.toFixed(2)}`
    : `$${n.toFixed(4)}`;

const tokens = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000 ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Execution price. Significant digits below $1 — memecoin prices live in the
 *  leading zeros, and toFixed(4) renders most of them as $0.0000. */
const price = (n: number) =>
    n >= 1
        ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
        : `$${n.toLocaleString(undefined, { maximumSignificantDigits: 4 })}`;

/** Wallet-only rows still need a stable, non-address label — the house rule is
 *  that a wallet address is never rendered for a human to read. */
const traderLabel = (r: { username: string | null }) => r.username ?? "Anonymous";

function Who({ row }: { row: { username: string | null; avatarUrl: string | null; account: string } }) {
    return (
        <span className="flex min-w-0 items-center gap-2.5">
            <span
                className="size-7 shrink-0 overflow-hidden rounded-full bg-muted"
                style={{ backgroundColor: row.avatarUrl ? undefined : stableHoverColor(row.account) }}
            >
                {row.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={row.avatarUrl} alt="" className="size-full object-cover" />
                ) : null}
            </span>
            <span className="min-w-0 truncate text-15 font-medium text-white">{traderLabel(row)}</span>
        </span>
    );
}

const swapHelper = createDataTableColumnHelper<SwapRow>();

export function SwapsTable({
    trades,
    loading,
    network,
}: {
    trades: SwapRow[];
    loading: boolean;
    /** Chain slug, for the per-row explorer link. */
    network: string;
}) {
    const columns = React.useMemo(
        () => [
            swapHelper.accessor("account", {
                header: "Trader",
                cell: ({ row }) => <Who row={row.original} />,
            }),
            swapHelper.accessor("isBuy", {
                header: "Side",
                meta: { width: "88px" },
                // The WORD, not just a colour: a red/green dot alone is
                // unreadable to a good fraction of people, and this is the one
                // column that says what happened.
                cell: ({ row }) => (
                    <span className={cn("text-15 font-semibold", row.original.isBuy ? "text-lantern" : "text-pastelred")}>
                        {row.original.isBuy ? "Buy" : "Sell"}
                    </span>
                ),
            }),
            swapHelper.accessor("usdValue", {
                header: "Value",
                meta: { width: "112px", align: "right" },
                cell: ({ row }) => (
                    <span className="text-15 font-medium tabular-nums text-white">{usd(row.original.usdValue)}</span>
                ),
            }),
            swapHelper.accessor("tokenAmount", {
                header: "Amount",
                meta: { width: "112px", align: "right" },
                cell: ({ row }) => (
                    <span className="text-15 font-medium tabular-nums text-zinc-400">
                        {tokens(row.original.tokenAmount)}
                    </span>
                ),
            }),
            swapHelper.accessor("priceUsd", {
                header: "Price",
                meta: { width: "104px", align: "right" },
                // The FILL price, falling back to usd/amount when the provider
                // didn't carry one — never the coin's current quote, or every
                // row would read the same number.
                cell: ({ row }) => {
                    const p =
                        row.original.priceUsd ??
                        (row.original.tokenAmount > 0 && row.original.usdValue > 0
                            ? row.original.usdValue / row.original.tokenAmount
                            : null);
                    return (
                        <span className="text-15 font-medium tabular-nums text-zinc-400">
                            {p != null ? price(p) : "—"}
                        </span>
                    );
                },
            }),
            swapHelper.accessor("ts", {
                header: "When",
                meta: { width: "96px", align: "right" },
                // ts is unix SECONDS (the tape's unit everywhere); Date wants
                // milliseconds. Unscaled, every 2026 trade renders as Jan 1970.
                cell: ({ row }) => (
                    <span className="text-15 font-medium tabular-nums text-zinc-500">
                        {row.original.ts ? formatRelativeTime(new Date(row.original.ts * 1000).toISOString()) : "—"}
                    </span>
                ),
            }),
            swapHelper.accessor("txHash", {
                header: "Txn",
                meta: { width: "56px", align: "right" },
                cell: ({ row }) => {
                    const href = explorerTxUrl(network, row.original.txHash);
                    if (!href) return null;
                    return (
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="View transaction on explorer"
                            className="inline-flex text-zinc-500 transition-colors hover:text-white"
                        >
                            <HugeiconsIcon icon={LinkSquare02Icon} className="size-4" strokeWidth={1.75} />
                        </a>
                    );
                },
            }),
        ],
        [network],
    );

    return (
        <DataTable
            data={trades.slice(0, 50)}
            columns={columns}
            // Two swaps by one wallet in the same second are different rows;
            // keying on the account alone would collapse them.
            getRowId={(r, i) => `${r.account}-${r.ts}-${i}`}
            reorderable
            rowHeight={56}
            loading={loading}
            skeletonRows={6}
            rowHoverRadius={12}
            rowHoverColor={(r) => stableHoverColor(r.account)}
            className="px-1.5 pb-1.5"
            emptyState={<p className="px-4 py-6 text-left text-sm text-zinc-500">No transactions in the last 24h.</p>}
        />
    );
}

const mentionHelper = createDataTableColumnHelper<MentionRow>();

export function MentionsTable({ mentions, loading }: { mentions: MentionRow[]; loading: boolean }) {
    const columns = React.useMemo(
        () => [
            mentionHelper.accessor("username", {
                header: "Poster",
                meta: { width: "200px" },
                cell: ({ row }) => (
                    <Who row={{ ...row.original, account: row.original.id }} />
                ),
            }),
            mentionHelper.accessor("text", {
                header: "Post",
                cell: ({ row }) => (
                    <span className="block min-w-0 truncate text-15 font-medium text-zinc-300">
                        {row.original.text || "—"}
                    </span>
                ),
            }),
            mentionHelper.accessor("ts", {
                header: "When",
                meta: { width: "96px", align: "right" },
                // Same unit as the swaps table: tags.forCoin returns unix
                // seconds, Date wants milliseconds.
                cell: ({ row }) => (
                    <span className="text-15 font-medium tabular-nums text-zinc-500">
                        {row.original.ts ? formatRelativeTime(new Date(row.original.ts * 1000).toISOString()) : "—"}
                    </span>
                ),
            }),
        ],
        [],
    );

    return (
        <DataTable
            data={mentions.slice(0, 50)}
            columns={columns}
            getRowId={(r) => r.id}
            reorderable
            rowHeight={56}
            loading={loading}
            skeletonRows={4}
            rowHoverRadius={12}
            rowHoverColor={(r) => stableHoverColor(r.id)}
            className="px-1.5 pb-1.5"
            emptyState={
                <p className="px-4 py-6 text-left text-sm text-zinc-500">
                    No one has posted this ticker yet.
                </p>
            }
        />
    );
}
