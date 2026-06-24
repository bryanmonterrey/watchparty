import React, { useState } from "react"
import { Settings, Copy, Check, ExternalLink } from "lucide-react"
import { Token } from "@/db/schema/content"
import { Switch } from "@/components/ui/switch"
import { SolanaIcon } from "../icons"

export function TokenTradesTable({ token }: { token: Token }) {
    const [filterSize, setFilterSize] = useState(true)
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

    const allTrades = [
        { acc: "Fi1wCu99HAsb728hXWUz982hjAh", type: "Buy", sol: 0.19585185, tickerAmt: "4.75M", time: "1s ago", txn: "KnFbqd", isBuy: true },
        { acc: "opXcGM8912hASDz9812hjas1239", type: "Sell", sol: 1.25522062, tickerAmt: "27.28M", time: "5s ago", txn: "5hmLPp", isBuy: false },
        { acc: "ixWVTd12389hJASDz9812hasd12", type: "Sell", sol: 1.36310353, tickerAmt: "27.05M", time: "12s ago", txn: "4LENKo", isBuy: false },
        { acc: "J2nerb8219hHASD9821hjas123h", type: "Buy", sol: 0.90666666, tickerAmt: "19.21M", time: "18s ago", txn: "5xrvud", isBuy: true },
        { acc: "8Ebb8kto8912hJKAsd123981hja", type: "Sell", sol: 1.24363199, tickerAmt: "23.04M", time: "25s ago", txn: "5ixuRL", isBuy: false },
        { acc: "2AsdK2hz12389hJASDz98123has", type: "Buy", sol: 0.02105123, tickerAmt: "480K", time: "40s ago", txn: "9xkJ2a", isBuy: true },
        { acc: "L8sHjk89123hJASDz98123hasd8", type: "Buy", sol: 0.04500000, tickerAmt: "980K", time: "1m ago", txn: "3hJKas", isBuy: true },
        { acc: "Mn8Kjd12389hASDz9812hjas123", type: "Sell", sol: 0.01250000, tickerAmt: "250K", time: "2m ago", txn: "4jKl2a", isBuy: false },
        { acc: "Kl2sHjhJASDz98123hasd89123h", type: "Buy", sol: 0.09852000, tickerAmt: "2.10M", time: "3m ago", txn: "5HjKas", isBuy: true },
        { acc: "Op9sKa8219hHASD9821hjas123h", type: "Sell", sol: 0.04892000, tickerAmt: "1.00M", time: "4m ago", txn: "8JkLas", isBuy: false }
    ]

    const filteredTrades = filterSize 
        ? allTrades.filter(t => t.sol >= 0.05) 
        : allTrades

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
            {/* Filter Bar */}
            <div className="p-5 border-b border-zinc-800/40 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <span className="text-sm font-extrabold text-zinc-300">Filter by size</span>
                    <Switch 
                        checked={filterSize} 
                        onCheckedChange={setFilterSize} 
                        className="data-[state=checked]:bg-emerald-500" 
                    />
                    <div className="bg-zinc-850 border border-zinc-800 rounded-full px-3 py-1 text-xs text-zinc-300 flex items-center gap-1.5 font-bold shadow-inner">
                        <SolanaIcon className="size-3.5" /> 0.05 SOL
                    </div>
                </div>
                <span className="text-xs text-zinc-500 font-medium">
                    {filterSize ? "Showing trades > 0.05 SOL" : "Showing all trades"}
                </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="text-xs text-zinc-500 font-bold uppercase tracking-wider border-b border-zinc-800/40 bg-zinc-900/10">
                        <tr>
                            <th className="px-5 py-4">Account</th>
                            <th className="px-5 py-4">Type</th>
                            <th className="px-5 py-4">Amount (SOL)</th>
                            <th className="px-5 py-4">Amount ({token.ticker})</th>
                            <th className="px-5 py-4">
                                <div className="flex items-center gap-1">
                                    <span>Time</span>
                                    <Settings className="size-3 text-zinc-600" />
                                </div>
                            </th>
                            <th className="px-5 py-4 text-right">Txn</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/30">
                        {filteredTrades.map((trade, idx) => (
                            <tr key={idx} className="hover:bg-zinc-800/10 transition-colors group">
                                {/* Account Column */}
                                <td className="px-5 py-4">
                                    <div className="flex items-center gap-2">
                                        <div className={`size-2.5 rounded-full shrink-0 ${
                                            trade.isBuy ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-pastelred shadow-[0_0_8px_rgba(255,116,108,0.5)]'
                                        }`} />
                                        <div 
                                            onClick={() => copyToClipboard(trade.acc, idx)}
                                            className="flex items-center gap-1.5 font-bold text-zinc-300 hover:text-zinc-100 text-sm cursor-pointer transition-colors"
                                        >
                                            <span>{truncateAddress(trade.acc)}</span>
                                            {copiedIndex === idx ? (
                                                <Check className="size-3.5 text-emerald-500" />
                                            ) : (
                                                <Copy className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            )}
                                        </div>
                                    </div>
                                </td>

                                {/* Type Column */}
                                <td className="px-5 py-4">
                                    <span className={`font-extrabold text-sm ${
                                        trade.isBuy ? 'text-emerald-500' : 'text-pastelred'
                                    }`}>
                                        {trade.type}
                                    </span>
                                </td>

                                {/* Amount (SOL) Column */}
                                <td className="px-5 py-4">
                                    <span className="font-extrabold text-zinc-300 text-sm">
                                        {trade.sol.toFixed(5)}
                                    </span>
                                </td>

                                {/* Amount (TICKER) Column */}
                                <td className="px-5 py-4">
                                    <span className={`font-extrabold text-sm ${
                                        trade.isBuy ? 'text-emerald-500' : 'text-pastelred'
                                    }`}>
                                        {trade.tickerAmt}
                                    </span>
                                </td>

                                {/* Time Column */}
                                <td className="px-5 py-4">
                                    <span className="font-medium text-zinc-500 text-sm">
                                        {trade.time}
                                    </span>
                                </td>

                                {/* Txn Column */}
                                <td className="px-5 py-4 text-right">
                                    <a 
                                        href={`https://solscan.io/tx/${trade.txn}`}
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 font-semibold text-zinc-500 hover:text-zinc-300 text-sm cursor-pointer transition-colors"
                                    >
                                        <span>{trade.txn}</span>
                                        <ExternalLink className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </a>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
