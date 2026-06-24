import React, { useState } from "react"
import { Settings } from "lucide-react"
import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { SettingsIcon } from "../icons"

export function TokenSwapCard() {
    const [side, setSide] = useState<"buy" | "sell">("buy")

    return (
        <div className="bg-card rounded-[25px] p-5 flex flex-col">
            <div className="relative flex bg-[#16181c] rounded-full p-1 mb-6 shadow-inner w-full">
                {(["buy", "sell"] as const).map((s) => {
                    const active = side === s
                    return (
                        <button
                            key={s}
                            onClick={() => setSide(s)}
                            className={`relative z-10 cursor-pointer flex-1 py-2.5 text-lg font-bold rounded-full capitalize transition-colors duration-200 select-none focus:outline-none ${
                                active
                                    ? s === "buy"
                                        ? "text-emerald-500"
                                        : "text-emerald-500" // We'll keep the design color
                                    : "text-zinc-500 hover:text-zinc-300"
                            }`}
                            style={{
                                color: active
                                    ? s === "buy"
                                        ? "#10B981"
                                        : "#FF746C"
                                    : undefined
                            }}
                        >
                            {s}
                            {active && (
                                <motion.div
                                    layoutId="swap-side-bg"
                                    className={`absolute inset-0 rounded-full -z-10 ${
                                        s === "buy" ? "bg-emerald-500/15" : "bg-pastelred/15"
                                    }`}
                                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                />
                            )}
                        </button>
                    )
                })}
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
