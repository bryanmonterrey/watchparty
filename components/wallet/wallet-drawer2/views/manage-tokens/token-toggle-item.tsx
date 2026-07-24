"use client";

import { motion } from "motion/react";
import { AlertTriangle } from "lucide-react";
import { Token } from "../../types";
import { TokenIcon } from "../../components/token-icon";
import { cn } from "@/lib/utils";

interface TokenToggleItemProps {
    token: Token;
    shown: boolean;
    onToggle: (mint: string) => void;
}

export function TokenToggleItem({ token, shown, onToggle }: TokenToggleItemProps) {
    const isRisky = token.name.toLowerCase().includes("trump") || token.name.toLowerCase().includes("gme");

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-[#1C1C1E] rounded-[22px] p-4 flex items-center justify-between border border-white/5 group hover:bg-zinc-800/50 transition-colors"
        >
            <div className="flex items-center gap-4">
                <TokenIcon
                    src={token.icon}
                    symbol={token.symbol}
                    className="w-[48px] h-[48px] rounded-full shadow-lg"
                    showChainBadge={true}
                />
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                        <h3 className="text-[17px] font-bold text-white tracking-tight leading-tight truncate max-w-[140px]">
                            {token.name}
                        </h3>
                        {isRisky && <AlertTriangle className="w-4 h-4 text-lantern" />}
                    </div>
                    <p className="text-[15px] font-medium text-zinc-500">
                        {token.balance.toLocaleString(undefined, { maximumFractionDigits: 5 })} {token.symbol}
                    </p>
                </div>
            </div>

            <button
                onClick={() => onToggle(token.mint)}
                className={cn(
                    "relative w-[52px] h-[32px] rounded-full transition-colors duration-200 outline-none flex items-center px-1",
                    shown ? "bg-lantern" : "bg-zinc-700"
                )}
            >
                <motion.div
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="w-6 h-6 bg-white rounded-full shadow-md"
                    animate={{ x: shown ? 20 : 0 }}
                />
            </button>
        </motion.div>
    );
}
