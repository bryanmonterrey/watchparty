import React from "react"
import { Settings } from "lucide-react"
import { Token } from "@/db/schema/content"

import { Switch } from "@/components/ui/switch"
import { SolanaIcon } from "../icons"
export function TokenTradesTable({ token }: { token: Token }) {
    return (
        <div className="bg-black rounded-3xl border border-flexborder overflow-hidden flex flex-col">
            <div className="p-4 border-b border-zinc-800/50 flex items-center gap-3">
                <span className="text-lg font-medium text-zinc-300">Filter by size</span>
                <Switch defaultChecked className="data-[state=checked]:bg-twitter2" />
                <div className="bg-zinc-800/50 border border-zinc-700 rounded-full px-2 py-0.5 text-base text-zinc-300 flex items-center gap-1">
                    <SolanaIcon className="size-4" /> 0.05
                </div>
                <span className="text-base text-zinc-500 ml-1">(showing trades greater than 0.05 SOL)</span>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left text-lg whitespace-nowrap">
                    <thead className="text-base text-zinc-500 font-medium border-b border-zinc-800/50 bg-zinc-900/20">
                        <tr>
                            <th className="px-4 py-3 font-medium">Account</th>
                            <th className="px-4 py-3 font-medium">Type</th>
                            <th className="px-4 py-3 font-medium">Amount (SOL)</th>
                            <th className="px-4 py-3 font-medium">Amount ({token.ticker})</th>
                            <th className="px-4 py-3 font-medium">Time <Settings className="inline size-3" /></th>
                            <th className="px-4 py-3 font-medium text-right">Txn</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                        {[
                            { acc: "Fi1wCu", type: "Buy", sol: "0.195851850", fomo: "4.75m", time: "1s ago", txn: "KnFbqd", color: "text-emerald-500" },
                            { acc: "opXcGM", type: "Sell", sol: "1.255220621", fomo: "27.28m", time: "1s ago", txn: "5hmLPp", color: "text-pastelred" },
                            { acc: "ixWVTd", type: "Sell", sol: "1.363103536", fomo: "27.05m", time: "1s ago", txn: "4LENKo", color: "text-pastelred" },
                            { acc: "J2nerb", type: "Buy", sol: "0.906666666", fomo: "19.21m", time: "1s ago", txn: "5xrvud", color: "text-emerald-500" },
                            { acc: "8Ebb8k", type: "Sell", sol: "1.243631997", fomo: "23.04m", time: "1s ago", txn: "5ixuRL", color: "text-pastelred" },
                        ].map((trade, i) => (
                            <tr key={i} className="hover:bg-zinc-800/20 transition-colors">
                                <td className="px-4 py-3 flex items-center gap-2">
                                    <div className="size-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                                        <div className="size-3 rounded-full bg-emerald-500"></div>
                                    </div>
                                    <span className="font-medium text-zinc-300">{trade.acc}</span>
                                </td>
                                <td className={`px-4 py-3 font-medium ${trade.color}`}>{trade.type}</td>
                                <td className="px-4 py-3 text-zinc-300 text-base">{trade.sol}</td>
                                <td className={`px-4 py-3 text-base ${trade.color}`}>{trade.fomo}</td>
                                <td className="px-4 py-3 text-zinc-500 text-base">{trade.time}</td>
                                <td className="px-4 py-3 text-right text-zinc-500 text-base hover:text-zinc-300 cursor-pointer">{trade.txn}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
