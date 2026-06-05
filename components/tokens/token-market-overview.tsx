import React from "react"

export function TokenMarketOverview() {
    return (
        <div className="rounded-3xl flex flex-col">
            <div className="flex justify-between items-start mb-2 p-5 pb-1">
                <div>
                    <div className="text-zinc-400 font-bold text-lg mb-1">Market Cap</div>
                    <div className="text-3xl font-bold tracking-tight mb-1">$3.70K</div>
                    <div className="flex items-center gap-2 text-base">
                        <span className="text-pastelred font-medium">-$1.25K (-25.19%)</span>
                        <span className="text-zinc-500">24hr</span>
                    </div>
                </div>
                <div className="text-right">
                    <div className="flex items-center justify-end gap-2 text-base font-medium mb-2">
                        <span className="text-zinc-500">ATH</span>
                        <span className="text-zinc-300">$5.41K</span>
                    </div>
                    <div className="w-48 h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
                        <div className="h-full bg-emerald-500" style={{ width: '60%' }}></div>
                        <div className="h-full bg-zinc-600" style={{ width: '40%' }}></div>
                    </div>
                </div>
            </div>

            {/* Chart Area Placeholder */}
            <div className="w-full h-[400px] bg-black rounded-xl border border-flexborder/60 flex items-center justify-center relative overflow-hidden">
                {/* Fake chart lines */}
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(to right, #444444ff 1px, transparent 1px), linear-gradient(to bottom, #343434ff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
                <div className="z-10 flex flex-col items-center gap-2">
                    <span className="text-zinc-500 font-medium">Interactive Chart UI</span>
                    <span className="text-zinc-600 text-sm">TradingView widget will load here</span>
                </div>
            </div>
        </div>
    )
}
