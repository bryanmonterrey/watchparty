"use client"

import React, { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { Token } from "@/db/schema/content"
import { trpc } from "@/lib/trpc/client"
import { retryTransient } from "@/lib/query-retry";

interface TokenHoldersTableProps {
    token: Token
}

function formatAmount(v: number): string {
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
    return v.toFixed(2)
}

const truncate = (addr: string) => `${addr.slice(0, 5)}...${addr.slice(-5)}`

export function TokenHoldersTable({ token }: TokenHoldersTableProps) {
    const [copied, setCopied] = useState<string | null>(null)

    const { data, isLoading } = trpc.trade.getHolders.useQuery(
        { mint: token.tokenAddress! },
        { enabled: !!token.tokenAddress, staleTime: 60_000, refetchInterval: 60_000, retry: retryTransient(1) },
    )
    const holders = data?.holders ?? []

    const copy = (address: string) => {
        void navigator.clipboard.writeText(address)
        setCopied(address)
        setTimeout(() => setCopied(null), 1500)
    }

    // Special wallets get named instead of showing a bare address
    const labelFor = (owner: string) => {
        if (token.poolAddress && owner === token.poolAddress) return "Bonding curve"
        return null
    }

    return (
        <div className="bg-panel rounded-[25px] flex flex-col overflow-hidden w-full">
            <div className="p-5 flex items-center gap-2.5">
                <span className="text-lg font-extrabold text-white">Holders</span>
                <span className="bg-zinc-800 text-zinc-400 font-bold text-xs px-2.5 py-0.5 rounded-full">
                    {token.holderCount ?? holders.length}
                </span>
            </div>

            {isLoading && (
                <div className="flex flex-col gap-3 px-5 pb-6">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3">
                            <div className="h-3.5 w-8 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                            <div className="h-3.5 w-40 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                            <div className="ml-auto h-3.5 w-16 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                        </div>
                    ))}
                </div>
            )}

            {!isLoading && holders.length === 0 && (
                <div className="px-6 pb-12 pt-6 text-center">
                    <p className="text-sm font-bold text-zinc-400">
                        {token.tokenAddress ? "No holders indexed yet" : "Holders appear once trading goes live"}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-600">Top wallets show here as the coin trades</p>
                </div>
            )}

            {!isLoading && holders.length > 0 && (
                <div className="flex flex-col pb-2">
                    <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto_auto] items-center gap-3 px-5 pb-2 text-sm font-semibold text-zinc-500">
                        <span>#</span>
                        <span>Wallet</span>
                        <span className="text-right">Amount</span>
                        <span className="w-16 text-right">Share</span>
                    </div>
                    {holders.map((h, i) => {
                        const label = labelFor(h.owner)
                        return (
                            <div
                                key={h.owner}
                                className="group grid grid-cols-[2.5rem_minmax(0,1fr)_auto_auto] items-center gap-3 px-5 py-2.5 transition-colors hover:bg-white/[0.04]"
                            >
                                <span className="text-[13px] font-bold tabular-nums text-zinc-600">{i + 1}</span>
                                <button
                                    onClick={() => copy(h.owner)}
                                    className="flex min-w-0 cursor-pointer items-center gap-1.5 text-left text-[14px] font-bold text-zinc-300 transition-colors hover:text-white"
                                >
                                    <span className="truncate">{label ?? truncate(h.owner)}</span>
                                    {label && <span className="shrink-0 text-[12px] font-medium text-zinc-600">{truncate(h.owner)}</span>}
                                    {copied === h.owner
                                        ? <HugeiconsIcon icon={Tick02Icon} className="size-3.5 shrink-0 text-white" strokeWidth={2.5} />
                                        : <HugeiconsIcon icon={Copy01Icon} className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={2} />}
                                </button>
                                <span className="text-right text-[14px] font-semibold tabular-nums text-zinc-400">
                                    {formatAmount(h.amount)}
                                </span>
                                <span className="w-16 text-right text-[14px] font-bold tabular-nums text-white">
                                    {h.sharePercent < 0.01 ? "<0.01" : h.sharePercent.toFixed(2)}%
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
