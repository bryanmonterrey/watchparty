import React, { useState } from "react"
import { ChevronLeft, ChevronRight, Copy, Check } from "lucide-react"
import { Token } from "@/db/schema/content"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface TokenHoldersTableProps {
    token?: Token
}

export function TokenHoldersTable({ token }: TokenHoldersTableProps) {
    const [currentPage, setCurrentPage] = useState(1)
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

    const holderCount = token?.holderCount || 342

    const allHolders = [
        { name: "Liquidity pool 💧", address: "Meteora Pool (AMM)", pct: "66.44%", entry: "-", pnl: "-", isLP: true, isPositive: null },
        { name: "Creator 👑", address: "Fi1wCu99HAsb728hXWUz982hjAh", pct: "8.50%", entry: "$4.2K", pnl: "+$92.1K (+2192%)", isLP: false, isPositive: true },
        { name: "Early Buyer", address: "DxjmeH1j9823hASDz718h129hZA", pct: "4.00%", entry: "$5.1K", pnl: "+$12.4K (+243%)", isLP: false, isPositive: true },
        { name: "Early Buyer", address: "3CPHFkWY8192hJKA1098hjasd01", pct: "3.20%", entry: "$6.8K", pnl: "+$5.8K (+85%)", isLP: false, isPositive: true },
        { name: "Early Buyer", address: "BCrTyfxu8219hHASD9821hjas123", pct: "2.80%", entry: "$8.5K", pnl: "-$1.2K (-14%)", isLP: false, isPositive: false },
        { name: "User Wallet", address: "7eNRKTto8912hJKAsd123981hja5", pct: "2.10%", entry: "$12.0K", pnl: "+$850 (+7%)", isLP: false, isPositive: true },
        { name: "User Wallet", address: "42Pth3Lz12389hJASDz98123hasd", pct: "1.95%", entry: "$15.4K", pnl: "-$3.1K (-20%)", isLP: false, isPositive: false },
        { name: "Trader Wallet", address: "6TAHumyK12389hASDz9812hjas12", pct: "1.50%", entry: "$19.2K", pnl: "-$4.8K (-25%)", isLP: false, isPositive: false },
        { name: "Collector Wallet", address: "CaDymjbv12389hJASDz9812hasd1", pct: "1.10%", entry: "$22.0K", pnl: "-$6.2K (-28%)", isLP: false, isPositive: false },
        { name: "Holder Wallet", address: "H4wPZAi89123hJASDz98123hasd8", pct: "0.95%", entry: "$25.0K", pnl: "-$8.1K (-32%)", isLP: false, isPositive: false },
    ]

    const itemsPerPage = 5
    const totalPages = Math.ceil(allHolders.length / itemsPerPage)
    const startIndex = (currentPage - 1) * itemsPerPage
    const currentHolders = allHolders.slice(startIndex, startIndex + itemsPerPage)

    const copyToClipboard = (address: string, index: number) => {
        navigator.clipboard.writeText(address)
        setCopiedIndex(index)
        setTimeout(() => setCopiedIndex(null), 2000)
    }

    const truncateAddress = (addr: string) => {
        if (addr.length <= 12) return addr
        return `${addr.slice(0, 5)}...${addr.slice(-5)}`
    }

    return (
        <div className="bg-card rounded-[25px] flex flex-col overflow-hidden w-full">
            {/* Table Header / Actions */}
            <div className="p-5 border-b border-zinc-800/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-2.5">
                    <span className="text-lg font-extrabold text-white">Holders</span>
                    <span className="bg-zinc-800 text-zinc-400 font-bold text-xs px-2.5 py-0.5 rounded-full border border-zinc-700/20">
                        {holderCount}
                    </span>
                </div>
                
                <div className="flex items-center gap-2 self-stretch sm:self-auto">
                    <button className="cursor-pointer flex-1 sm:flex-none text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800/40 hover:bg-zinc-800/80 px-3.5 py-2 rounded-full border border-zinc-800 hover:border-zinc-700/50 transition-all">
                        All holders
                    </button>
                    <button className="cursor-pointer flex-1 sm:flex-none text-xs font-bold text-zinc-400 hover:text-white bg-zinc-800/40 hover:bg-zinc-800/80 px-3.5 py-2 rounded-full border border-zinc-800 hover:border-zinc-700/50 transition-all">
                        Bubble map
                    </button>
                </div>
            </div>

            {/* Table Container */}
            <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="text-xs text-zinc-500 font-bold uppercase tracking-wider border-b border-zinc-800/40 bg-zinc-900/10">
                        <tr>
                            <th className="px-5 py-4">Holder</th>
                            <th className="px-5 py-4">% of supply</th>
                            <th className="px-5 py-4">Entry mcap</th>
                            <th className="px-5 py-4 text-right">PnL</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/30">
                        {currentHolders.map((holder, idx) => {
                            const globalIdx = startIndex + idx
                            return (
                                <tr key={globalIdx} className="hover:bg-zinc-800/10 transition-colors group">
                                    {/* Holder Info */}
                                    <td className="px-5 py-4 flex items-center gap-3">
                                        <Avatar className="size-6 border border-zinc-800 bg-zinc-800/60 shrink-0">
                                            <AvatarFallback className="text-[10px] text-zinc-400 font-bold bg-zinc-800">
                                                {holder.isLP ? "LP" : holder.name.slice(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-bold text-zinc-200 text-sm">
                                                {holder.name}
                                            </span>
                                            <div 
                                                onClick={() => copyToClipboard(holder.address, globalIdx)}
                                                className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors"
                                            >
                                                <span>{truncateAddress(holder.address)}</span>
                                                {copiedIndex === globalIdx ? (
                                                    <Check className="size-3 text-emerald-500" />
                                                ) : (
                                                    <Copy className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    {/* Percentage */}
                                    <td className="px-5 py-4">
                                        <span className="font-extrabold text-zinc-300 text-sm">
                                            {holder.pct}
                                        </span>
                                    </td>

                                    {/* Entry MCAP */}
                                    <td className="px-5 py-4">
                                        <span className="font-semibold text-zinc-400 text-sm">
                                            {holder.entry}
                                        </span>
                                    </td>

                                    {/* PnL */}
                                    <td className="px-5 py-4 text-right">
                                        {holder.isLP ? (
                                            <span className="text-zinc-500 font-medium text-sm">-</span>
                                        ) : (
                                            <span className={`font-extrabold text-sm ${
                                                holder.isPositive ? 'text-emerald-500' : 'text-pastelred'
                                            }`}>
                                                {holder.pnl}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-zinc-800/40 flex items-center justify-between bg-zinc-950/20">
                <span className="text-xs text-zinc-500 font-semibold">
                    Showing {startIndex + 1}-{Math.min(startIndex + itemsPerPage, allHolders.length)} of {allHolders.length}
                </span>

                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="cursor-pointer p-2 rounded-full bg-zinc-800/30 hover:bg-zinc-800/80 border border-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-all"
                    >
                        <ChevronLeft className="size-4 text-zinc-300" />
                    </button>
                    <span className="text-xs font-extrabold text-zinc-300 px-1">
                        Page {currentPage} of {totalPages}
                    </span>
                    <button 
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="cursor-pointer p-2 rounded-full bg-zinc-800/30 hover:bg-zinc-800/80 border border-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-all"
                    >
                        <ChevronRight className="size-4 text-zinc-300" />
                    </button>
                </div>
            </div>
        </div>
    )
}
