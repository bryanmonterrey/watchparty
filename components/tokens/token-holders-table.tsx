import React from "react"

export function TokenHoldersTable() {
    return (
        <div className="bg-black rounded-3xl border border-flexborder flex flex-col overflow-hidden">
            <div className="p-4 border-b border-zinc-800/50 flex items-center justify-between">
                <span className="text-lg font-bold text-zinc-200">Top holders</span>
                <span className="text-base font-medium text-zinc-400 bg-zinc-800/50 px-2 py-1 rounded-full border border-zinc-700">Bubble map</span>
            </div>
            
            <div className="p-4 flex flex-col gap-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                <div className="flex items-center justify-between text-lg">
                    <span className="text-zinc-300 font-medium flex items-center gap-1">Liquidity pool 💧</span>
                    <span className="text-zinc-300">66.44%</span>
                </div>
                {[
                    { acc: "4hwP...ZAi8", pct: "4.00%" },
                    { acc: "Dxjm...eH1j", pct: "4.00%" },
                    { acc: "3CPH...FkWY", pct: "4.00%" },
                    { acc: "BCrT...yfxu", pct: "4.00%" },
                    { acc: "7eNR...KTto", pct: "4.00%" },
                    { acc: "42Pt...h3Lz", pct: "2.35%" },
                    { acc: "6TAH...umyK", pct: "2.35%" },
                    { acc: "CaDy...mjbv", pct: "1.88%" },
                ].map((holder, i) => (
                    <div key={i} className="flex items-center justify-between text-base group cursor-pointer">
                        <span className="text-zinc-400 group-hover:text-zinc-200 transition-colors">{holder.acc}</span>
                        <span className="text-zinc-300">{holder.pct}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
