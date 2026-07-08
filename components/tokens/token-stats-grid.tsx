import React from "react"
import { Token } from "@/db/schema/content"

interface TokenStatsGridProps {
    token: Token
}

export function TokenStatsGrid({ token }: TokenStatsGridProps) {
    const vol24h = token.volume24hUsd ?? null
    const price = token.priceUsd ?? null
    const change24h = token.priceChange24h ?? null
    const holders = token.holderCount ?? null
    const txns = token.txCount24h ?? null

    const formatVol = (val: number | null) => {
        if (val === null) return "—"
        if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`
        if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`
        return `$${val.toFixed(2)}`
    }

    const formatPrice = (val: number | null) => {
        if (val === null) return "—"
        if (val === 0) return "$0.00"
        if (val < 0.00001) return `$${val.toFixed(8)}`
        if (val < 0.01) return `$${val.toFixed(6)}`
        if (val < 1) return `$${val.toFixed(4)}`
        return `$${val.toFixed(2)}`
    }

    const formatCount = (val: number | null) =>
        val === null ? "—" : val >= 1000 ? `${(val / 1000).toFixed(1)}K` : String(val)

    const formatChange = (val: number | null) => {
        if (val === null) return "—"
        const sign = val >= 0 ? "+" : ""
        return `${sign}${val.toFixed(2)}%`
    }

    const changeColor = change24h === null ? "text-zinc-200" : change24h >= 0 ? "text-emerald-500" : "text-pastelred"

    const stats = [
        { label: "Vol 24h", value: formatVol(vol24h), color: "text-zinc-200" },
        { label: "Price", value: formatPrice(price), color: "text-zinc-200" },
        { label: "24h", value: formatChange(change24h), color: changeColor },
        { label: "Holders", value: formatCount(holders), color: "text-zinc-200" },
        { label: "Txns 24h", value: formatCount(txns), color: "text-zinc-200" }
    ]

    return (
        <div className="bg-panel rounded-[25px] p-6 grid grid-cols-2 md:grid-cols-5 gap-4">
            {stats.map((stat, i) => (
                <div key={i} className="flex flex-col items-center justify-center py-2">
                    <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-1.5">{stat.label}</span>
                    <span className={`text-md font-extrabold tracking-tight ${stat.color}`}>{stat.value}</span>
                </div>
            ))}
        </div>
    )
}

