"use client"

import React, { useEffect, useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, Tick02Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons"
import { formatDistanceToNowStrict } from "date-fns"
import { Token } from "@/db/schema/content"
import { Switch } from "@/components/ui/switch"
import { trpc } from "@/lib/trpc/client"
import { subscribeTrades, type LiveTrade } from "@/lib/coins/trade-stream"
import { coinTag, logClient } from "@/lib/client-log"
import { retryTransient } from "@/lib/query-retry";
import { stableHoverColor } from "@/lib/stable-hover-color"
import { DataTable, createDataTableColumnHelper } from "@/components/ui/data-table"

type TradeRow = {
    txHash: string
    account: string
    isBuy: boolean
    usdValue: number
    tokenAmount: number
    ts?: number | null
}

const truncateAddress = (addr: string) =>
    addr.length <= 12 ? addr : `${addr.slice(0, 5)}...${addr.slice(-5)}`

const formatUsd = (val: number) => {
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`
    return `$${val.toFixed(2)}`
}

const formatAmount = (val: number) => {
    if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`
    if (val >= 1_000) return `${(val / 1_000).toFixed(1)}K`
    return val.toFixed(2)
}

/** Own copied state — a shared index would follow the wrong row after a sort. */
function AccountCell({ trade }: { trade: TradeRow }) {
    const [copied, setCopied] = useState(false)

    return (
        <div className="flex items-center gap-2">
            <div
                className={`size-2.5 rounded-full shrink-0 ${
                    trade.isBuy
                        ? "bg-lantern shadow-[0_0_8px_rgba(0,237,137,0.5)]"
                        : "bg-pastelred shadow-[0_0_8px_rgba(255,116,108,0.5)]"
                }`}
            />
            <div
                onClick={() => {
                    navigator.clipboard.writeText(trade.account)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                }}
                className="flex cursor-pointer items-center gap-1.5 text-sm font-bold text-zinc-300 transition-colors hover:text-zinc-100"
            >
                <span>{truncateAddress(trade.account)}</span>
                {copied ? (
                    <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-lantern" strokeWidth={2.5} />
                ) : (
                    <HugeiconsIcon
                        icon={Copy01Icon}
                        className="size-3 opacity-0 transition-opacity group-hover/row:opacity-100"
                        strokeWidth={2}
                    />
                )}
            </div>
        </div>
    )
}

const helper = createDataTableColumnHelper<TradeRow>()

export function TokenTradesTable({ token }: { token: Token }) {
    const [filterSize, setFilterSize] = useState(false)

    // Initial page of the tape. The poll is now a SELF-HEAL, not the source of
    // perceived liveness — new swaps arrive over the subscription below within
    // a second or two, and this only backfills identities and anything the
    // socket missed while the tab was backgrounded.
    const { data: trades = [], isLoading } = trpc.wallet.getTokenTrades.useQuery(
        { mint: token.tokenAddress! },
        { enabled: !!token.tokenAddress, staleTime: 30_000, refetchInterval: 60_000, retry: retryTransient(1) }
    )

    // Swaps that landed since the last fetch, newest first.
    const [live, setLive] = useState<LiveTrade[]>([])

    useEffect(() => {
        if (!token.tokenAddress) return
        // Clear on token change, or the previous coin's tape bleeds into this one.
        setLive([])
        return subscribeTrades("solana", token.tokenAddress, (t) => {
            // Every pushed swap, so the terminal shows how live the tape really
            // is. A visit with zero of these and non-zero fetched rows means the
            // subscription is up but nothing is arriving — indistinguishable on
            // screen from a quiet coin.
            logClient("tx", { coin: coinTag("solana", token.tokenAddress!), usd: Math.round(t.usdValue), buy: t.isBuy });
            // Cap the buffer: a hot pool can print faster than anyone reads, and
            // an unbounded array would grow for as long as the tab is open.
            setLive((prev) => (prev.some((p) => p.txHash === t.txHash) ? prev : [t, ...prev].slice(0, 100)))
        })
    }, [token.tokenAddress])

    // Merge, preferring the FETCHED row when both exist: it carries the
    // username and avatar that the stream deliberately doesn't look up.
    const merged = useMemo<TradeRow[]>(() => {
        const seen = new Set(trades.map((t) => t.txHash))
        return [...live.filter((t) => !seen.has(t.txHash)), ...trades]
    }, [live, trades])

    // "Filter by size" = trades worth more than $100.
    const filteredTrades = useMemo(
        () => (filterSize ? merged.filter((t) => t.usdValue >= 100) : merged),
        [filterSize, merged],
    )

    const columns = useMemo(
        () => [
            helper.accessor("account", {
                id: "account",
                header: "Account",
                enableSorting: false,
                cell: ({ row }) => <AccountCell trade={row.original} />,
            }),
            helper.accessor((t) => (t.isBuy ? 1 : 0), {
                id: "type",
                header: "Type",
                sortDescFirst: true,
                meta: { width: "96px" },
                cell: ({ row }) => (
                    <span
                        className={`text-sm font-extrabold ${row.original.isBuy ? "text-lantern" : "text-pastelred"}`}
                    >
                        {row.original.isBuy ? "Buy" : "Sell"}
                    </span>
                ),
            }),
            helper.accessor("usdValue", {
                id: "value",
                header: "Value (USD)",
                sortDescFirst: true,
                meta: { width: "140px" },
                cell: ({ row }) => (
                    <span className="text-sm font-extrabold text-zinc-300">{formatUsd(row.original.usdValue)}</span>
                ),
            }),
            helper.accessor("tokenAmount", {
                id: "amount",
                header: `Amount (${token.ticker})`,
                sortDescFirst: true,
                meta: { width: "160px" },
                cell: ({ row }) => (
                    <span
                        className={`text-sm font-extrabold ${row.original.isBuy ? "text-lantern" : "text-pastelred"}`}
                    >
                        {formatAmount(row.original.tokenAmount)}
                    </span>
                ),
            }),
            helper.accessor((t) => t.ts ?? 0, {
                id: "time",
                header: "Time",
                sortDescFirst: true,
                meta: { width: "140px" },
                cell: ({ row }) => (
                    <span className="text-sm font-medium text-zinc-500">
                        {row.original.ts ? `${formatDistanceToNowStrict(new Date(row.original.ts * 1000))} ago` : "—"}
                    </span>
                ),
            }),
            helper.display({
                id: "txn",
                header: "Txn",
                meta: { align: "right", width: "160px" },
                cell: ({ row }) => (
                    <a
                        href={`https://solscan.io/tx/${row.original.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex cursor-pointer items-center gap-1 text-sm font-semibold text-zinc-500 transition-colors hover:text-zinc-300"
                    >
                        <span>{row.original.txHash ? truncateAddress(row.original.txHash) : "—"}</span>
                        <HugeiconsIcon
                            icon={LinkSquare02Icon}
                            className="size-3 opacity-0 transition-opacity group-hover/row:opacity-100"
                            strokeWidth={2}
                        />
                    </a>
                ),
            }),
        ],
        [token.ticker],
    )

    return (
        {/* bg-canvas, not the bg-panel card this used to be — the board sits
            straight on the page like /trade and the trending table, so a row is
            defined by its own hover wash rather than by a raised surface. */}
        <div className="bg-canvas rounded-[25px] flex flex-col overflow-hidden w-full">
            {/* Filter Bar */}
            <div className="p-5 border-b border-zinc-800/40 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-extrabold text-zinc-300">Filter by size</span>
                    <Switch
                        checked={filterSize}
                        onCheckedChange={setFilterSize}
                        className="data-[state=checked]:bg-lantern"
                    />
                    <div className="bg-zinc-850 border border-zinc-800 rounded-full px-3 py-1 text-xs text-zinc-300 flex items-center gap-1.5 font-bold shadow-inner">
                        &gt; $100
                    </div>
                </div>
                <span className="text-xs text-zinc-500 font-medium">
                    {filterSize ? "Showing trades > $100" : "Showing all trades"}
                </span>
            </div>

            {/* No default sorting: the tape's own newest-first order is the
                meaningful one, and TanStack leaves the rows alone until a header
                is actually clicked. */}
            <DataTable
                data={filteredTrades}
                columns={columns}
                getRowId={(t, i) => t.txHash || String(i)}
                rowHeight={56}
                loading={isLoading}
                skeletonRows={8}
                rowHoverRadius={12}
                rowHoverColor={(t) => stableHoverColor(t.account)}
                className="px-3 py-3"
                emptyState={
                    <div className="p-10 text-center text-sm text-zinc-600">
                        {token.tokenAddress ? "No trades yet" : "Trades appear once trading goes live"}
                    </div>
                }
            />
        </div>
    )
}
