import React from "react"

export function TokenBondingCurve() {
    return (
        <div className="bg-panel rounded-[25px] p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between text-lg font-bold">
                <span className="text-zinc-200">Bonding curve progress</span>
                <span className="text-zinc-200">100.0%</span>
            </div>
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div 
                    className="h-full" 
                    style={{ 
                        width: '100%',
                        background: "linear-gradient(270deg,#efa59e 0%,#f5ccd1 8.3%,#f7ceb3 16.6%,#eccfa5 25%,#b9d8ae 33.3%,#97d6e3 41.6%,#9fb1e8 50%,#97d6e3 58.3%,#b9d8ae 66.6%,#eccfa5 75%,#f7ceb3 83.3%,#f5ccd1 91.6%,#efa59e 100%)",
                        backgroundSize: "200% 100%",
                        animation: "scrubber-rainbow 2500ms linear infinite",
                    }}
                ></div>
            </div>
            <p className="text-md text-zinc-500 mt-1">Coin has graduated!</p>
        </div>
    )
}
