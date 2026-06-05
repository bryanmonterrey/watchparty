"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface BuyAmountInputProps {
    amount: string;
    onAmountChange: (val: string) => void;
}

export function BuyAmountInput({ amount, onAmountChange }: BuyAmountInputProps) {
    const quickAmounts = ["30", "50", "100", "250"];
    const inputRef = React.useRef<HTMLInputElement>(null);

    return (
        <div className="space-y-4">
            <div 
                onClick={() => inputRef.current?.focus()}
                className="bg-[#1b1b1c] cursor-pointer border border-zinc-800/60 rounded-[28px] p-6 text-center group transition-all hover:border-zinc-700/80"
            >
                <p className="text-[13px] font-medium text-zinc-500 mb-2 uppercase tracking-wider">You Pay</p>
                
                <div className="flex items-center justify-center">
                    <span className="text-4xl font-bold text-white/40 mr-2 select-none">$</span>
                    <div className="relative">
                        <span className="invisible absolute whitespace-pre text-5xl font-bold">
                            {amount || "0"}
                        </span>
                        <input
                            ref={inputRef}
                            type="number"
                            value={amount}
                            onChange={(e) => onAmountChange(e.target.value)}
                            className="bg-transparent text-5xl font-bold text-white text-left outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-w-[40px] max-w-[200px]"
                            style={{ width: `${Math.max(40, (amount?.length || 1) * 30)}px` }}
                            autoFocus
                        />
                    </div>
                </div>
                
                <p className="text-[14px] font-medium text-zinc-400 mt-2">USD</p>
            </div>

            {/* Quick Select */}
            <div className="flex justify-between gap-2">
                {quickAmounts.map((amt) => (
                    <button
                        key={amt}
                        onClick={() => onAmountChange(amt)}
                        className={cn(
                            "flex-1 cursor-pointer py-3 px-1 rounded-2xl text-[14px] font-semibold transition-all border",
                            amount === amt
                                ? "bg-white text-black border-white"
                                : "bg-zinc-900/40 text-zinc-400 border-zinc-800/50 hover:border-zinc-700 hover:text-white"
                        )}
                    >
                        ${amt}
                    </button>
                ))}
            </div>
        </div>
    );
}
