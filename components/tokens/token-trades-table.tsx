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

export function TokenTradesTable({ token }: { token: Token }) {
    const [filterSize, setFilterSize] = useState(false)
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

    // Initial page of the tape. The poll is now a SELF-HEAL, not the source of
    // perceived liveness — new swaps arrive over the subscription below within
    // a second or two, and this only backfills identities and anything the
    // socket missed while the tab was backgrounded.
    const { data: trades = [], isLoading } = trpc.wallet.getTokenTrades.useQuery(
        { mint: token.tokenAddress! },
        { enabled: !!token.tokenAddress, staleTime: 30_000, refetchInterval: 60_000, retry: 1 }
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
    const merged = useMemo(() => {
        const seen = new Set(trades.map((t) => t.txHash))
        return [...live.filter((t) => !seen.has(t.txHash)), ...trades]
    }, [live, trades])

    // "Filter by size" = trades worth more than $100.
    const filteredTrades = filterSize ? merged.filter((t) => t.usdValue >= 100) : merged

    const copyToClipboard = (address: string, index: number) => {
        navigator.clipboard.writeText(address)
        setCopiedIndex(index)
        setTimeout(() => setCopiedIndex(null), 2000)
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

    return (
        <div className="bg-panel rounded-[25px] flex flex-col overflow-hidden w-full">
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

            {/* Table */}
            <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="text-xs text-zinc-500 font-bold uppercase tracking-wider border-b border-zinc-800/40 bg-zinc-900/10">
                        <tr>
                            <th className="px-5 py-4">Account</th>
                            <th className="px-5 py-4">Type</th>
                            <th className="px-5 py-4">Value (USD)</th>
                            <th className="px-5 py-4">Amount ({token.ticker})</th>
                            <th className="px-5 py-4">Time</th>
                            <th className="px-5 py-4 text-right">Txn</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/30">
                        {filteredTrades.map((trade, idx) => (
                            <tr key={trade.txHash || idx} className="hover:bg-zinc-800/10 transition-colors group">
                                {/* Account Column */}
                                <td className="px-5 py-4">
                                    <div className="flex items-center gap-2">
                                        <div className={`size-2.5 rounded-full shrink-0 ${
                                            trade.isBuy ? 'bg-lantern shadow-[0_0_8px_rgba(0,237,137,0.5)]' : 'bg-pastelred shadow-[0_0_8px_rgba(255,116,108,0.5)]'
                                        }`} />
                                        <div
                                            onClick={() => copyToClipboard(trade.account, idx)}
                                            className="flex items-center gap-1.5 font-bold text-zinc-300 hover:text-zinc-100 text-sm cursor-pointer transition-colors"
                                        >
                                            <span>{truncateAddress(trade.account)}</span>
                                            {copiedIndex === idx ? (
                                                <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-lantern" strokeWidth={2.5} />
                                            ) : (
                                                <HugeiconsIcon icon={Copy01Icon} className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={2} />
                                            )}
                                        </div>
                                    </div>
                                </td>

                                {/* Type Column */}
                                <td className="px-5 py-4">
                                    <span className={`font-extrabold text-sm ${
                                        trade.isBuy ? 'text-lantern' : 'text-pastelred'
                                    }`}>
                                        {trade.isBuy ? "Buy" : "Sell"}
                                    </span>
                                </td>

                                {/* Value (USD) Column */}
                                <td className="px-5 py-4">
                                    <span className="font-extrabold text-zinc-300 text-sm">
                                        {formatUsd(trade.usdValue)}
                                    </span>
                                </td>

                                {/* Amount (TICKER) Column */}
                                <td className="px-5 py-4">
                                    <span className={`font-extrabold text-sm ${
                                        trade.isBuy ? 'text-lantern' : 'text-pastelred'
                                    }`}>
                                        {formatAmount(trade.tokenAmount)}
                                    </span>
                                </td>

                                {/* Time Column */}
                                <td className="px-5 py-4">
                                    <span className="font-medium text-zinc-500 text-sm">
                                        {trade.ts ? `${formatDistanceToNowStrict(new Date(trade.ts * 1000))} ago` : "—"}
                                    </span>
                                </td>

                                {/* Txn Column */}
                                <td className="px-5 py-4 text-right">
                                    <a
                                        href={`https://solscan.io/tx/${trade.txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 font-semibold text-zinc-500 hover:text-zinc-300 text-sm cursor-pointer transition-colors"
                                    >
                                        <span>{trade.txHash ? truncateAddress(trade.txHash) : "—"}</span>
                                        <HugeiconsIcon icon={LinkSquare02Icon} className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={2} />
                                    </a>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Empty / loading states */}
                {isLoading && (
                    <div className="p-10 text-center text-zinc-600 text-sm">Loading trades…</div>
                )}
                {!isLoading && filteredTrades.length === 0 && (
                    <div className="p-10 text-center text-zinc-600 text-sm">
                        {token.tokenAddress ? "No trades yet" : "Trades appear once trading goes live"}
                    </div>
                )}
            </div>
        </div>
    )
}
