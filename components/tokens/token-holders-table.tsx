"use client"

import React, { useMemo, useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { Token } from "@/db/schema/content"
import { trpc } from "@/lib/trpc/client"
import { retryTransient } from "@/lib/query-retry";
import { stableHoverColor } from "@/lib/stable-hover-color"
import { DataTable, createDataTableColumnHelper } from "@/components/ui/data-table"

interface TokenHoldersTableProps {
    token: Token
}

type Holder = { owner: string; amount: number; sharePercent: number }

function formatAmount(v: number): string {
    if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
    return v.toFixed(2)
}

const truncate = (addr: string) => `${addr.slice(0, 5)}...${addr.slice(-5)}`

/** Owns its own copied state so the flag can't outlive a re-sort of the rows. */
function WalletCell({ owner, label }: { owner: string; label: string | null }) {
    const [copied, setCopied] = useState(false)

    const copy = () => {
        void navigator.clipboard.writeText(owner)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    return (
        <button
            onClick={copy}
            className="group/wallet flex min-w-0 cursor-pointer items-center gap-1.5 text-left text-[14px] font-bold text-zinc-300 transition-colors hover:text-white"
        >
            <span className="truncate">{label ?? truncate(owner)}</span>
            {label && <span className="shrink-0 text-[12px] font-medium text-zinc-600">{truncate(owner)}</span>}
            {copied
                ? <HugeiconsIcon icon={Tick02Icon} className="size-3.5 shrink-0 text-white" strokeWidth={2.5} />
                : <HugeiconsIcon icon={Copy01Icon} className="size-3 shrink-0 opacity-0 transition-opacity group-hover/wallet:opacity-100" strokeWidth={2} />}
        </button>
    )
}

const helper = createDataTableColumnHelper<Holder>()

export function TokenHoldersTable({ token }: TokenHoldersTableProps) {
    const { data, isLoading } = trpc.trade.getHolders.useQuery(
        { mint: token.tokenAddress! },
        { enabled: !!token.tokenAddress, staleTime: 60_000, refetchInterval: 60_000, retry: retryTransient(1) },
    )
    const holders = useMemo(() => data?.holders ?? [], [data])

    // Special wallets get named instead of showing a bare address.
    const poolAddress = token.poolAddress

    const columns = useMemo(
        () => [
            helper.display({
                id: "rank",
                header: "#",
                // row.index, not the array position: it follows the CURRENT sort,
                // so the rank column keeps counting 1..n after a header click
                // instead of shuffling with the rows.
                cell: ({ row }) => (
                    <span className="text-[13px] font-bold tabular-nums text-zinc-600">{row.index + 1}</span>
                ),
                meta: { width: "44px" },
            }),
            helper.accessor("owner", {
                id: "wallet",
                header: "Wallet",
                enableSorting: false,
                cell: ({ row }) => (
                    <WalletCell
                        owner={row.original.owner}
                        label={poolAddress && row.original.owner === poolAddress ? "Bonding curve" : null}
                    />
                ),
            }),
            helper.accessor("amount", {
                id: "amount",
                header: "Amount",
                sortDescFirst: true,
                meta: { align: "right", width: "140px" },
                cell: ({ row }) => (
                    <span className="text-[14px] font-semibold tabular-nums text-zinc-400">
                        {formatAmount(row.original.amount)}
                    </span>
                ),
            }),
            helper.accessor("sharePercent", {
                id: "share",
                header: "Share",
                sortDescFirst: true,
                meta: { align: "right", width: "104px" },
                cell: ({ row }) => (
                    <span className="text-[14px] font-bold tabular-nums text-white">
                        {row.original.sharePercent < 0.01 ? "<0.01" : row.original.sharePercent.toFixed(2)}%
                    </span>
                ),
            }),
        ],
        [poolAddress],
    )

    // bg-canvas, not the bg-panel card this used to be — the board sits
    // straight on the page like /trade and the trending table, so a row is
    // defined by its own hover wash rather than by a raised surface.
    //
    // A `//` comment ABOVE the return, never a {/* */} directly after `return (`
    // — that position parses as an object literal and Turbopack fails the build
    // on it, which is exactly how this shipped red.
    return (
        <div className="bg-canvas rounded-[25px] flex flex-col overflow-hidden w-full">
            <div className="p-5 flex items-center gap-2.5">
                <span className="text-lg font-extrabold text-white">Holders</span>
                <span className="bg-zinc-800 text-zinc-400 font-bold text-xs px-2.5 py-0.5 rounded-full">
                    {token.holderCount ?? holders.length}
                </span>
            </div>

            {/* Amount and Share sort from the header now. The server still hands
                back top-holders-by-size, so the default view is unchanged. */}
            <DataTable
                data={holders}
                columns={columns}
                getRowId={(h) => h.owner}
                rowHeight={44}
                loading={isLoading}
                skeletonRows={6}
                rowHoverRadius={12}
                rowHoverColor={(h) => stableHoverColor(h.owner)}
                className="px-3 pb-3"
                emptyState={
                    <div className="px-6 pb-6 text-center">
                        <p className="text-sm font-bold text-zinc-400">
                            {token.tokenAddress ? "No holders indexed yet" : "Holders appear once trading goes live"}
                        </p>
                        <p className="mt-0.5 text-xs text-zinc-600">Top wallets show here as the coin trades</p>
                    </div>
                }
            />
        </div>
    )
}
