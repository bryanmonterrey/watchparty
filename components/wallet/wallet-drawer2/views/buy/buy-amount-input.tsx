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
        <div className="space-y-3">
            <div 
                onClick={() => inputRef.current?.focus()}
                className="group cursor-pointer rounded-3xl border border-baseborder/20 bg-panel2 p-6 text-center transition-colors hover:bg-white/[0.05]"
            >
                <p className="mb-2 text-12 font-medium text-zinc-500">You pay</p>
                
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
                
                <p className="mt-2 text-12 font-medium text-zinc-500">USD</p>
            </div>

            {/* Quick Select */}
            <div className="flex justify-between gap-1">
                {quickAmounts.map((amt) => (
                    <button
                        key={amt}
                        onClick={() => onAmountChange(amt)}
                        className={cn(
                            // Pills, and neutral — the selected state was a
                            // white border on a white fill, i.e. two elevation
                            // languages in one control.
                            "h-11 flex-1 cursor-pointer rounded-full px-1 text-13 font-bold transition-colors",
                            amount === amt
                                ? "bg-white text-black"
                                : "bg-white/[0.06] text-zinc-400 hover:bg-white/[0.12] hover:text-white"
                        )}
                    >
                        ${amt}
                    </button>
                ))}
            </div>
        </div>
    );
}
