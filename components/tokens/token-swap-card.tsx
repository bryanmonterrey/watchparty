import React from "react"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SettingsIcon } from "../icons"

export function TokenSwapCard() {
    return (
        <div className="bg-black rounded-4xl border border-flexborder p-5 flex flex-col">
            <div className="flex bg-zinc-900 rounded-full p-1 mb-6">
                <button className="cursor-pointer active:cursor-none flex-1 py-2.5 text-lg font-bold rounded-full bg-emerald-500/15 text-emerald-500 shadow-sm transition-all">Buy</button>
                <button className="cursor-pointer active:cursor-none flex-1 py-2.5 text-lg font-bold rounded-full text-zinc-500 hover:text-zinc-300 transition-all">Sell</button>
            </div>

            <div className="flex items-center justify-center gap-1 mb-6">
                <span className="text-zinc-500 text-3xl font-medium">$</span>
                <input 
                    type="text" 
                    placeholder="0" 
                    className="bg-transparent text-5xl font-bold w-16 outline-none text-center text-zinc-100 placeholder:text-zinc-600"
                />
                <div className="bg-zinc-800 rounded-full px-3 py-1 text-xs font-semibold text-zinc-400 ml-2">USD</div>
            </div>

            <div className="flex items-center gap-2 mb-6">
                {["$25", "$100", "$250"].map((amt) => (
                    <button key={amt} className="cursor-pointer flex-1 py-3 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors text-md font-semibold text-zinc-300">
                        {amt}
                    </button>
                ))}
                <button className="cursor-pointer px-3 flex items-center justify-center py-3 rounded-full bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors">
                    <SettingsIcon className="size-4 text-zinc-400" />
                </button>
            </div>

            <Button className="cursor-pointer w-full h-15 bg-white2 hover:bg-white text-black font-bold rounded-full text-lg transition-colors shadow-[0_0_20px_rgba(16,185,129,0.2)]"
             >
                Connect wallet
            </Button>
            
            <div className="flex items-center justify-end gap-1 mt-4 text-sm font-semibold text-zinc-500">
                <SettingsIcon className="size-3.5" />
                <span>2% • Turbo</span>
            </div>
        </div>
    )
}
