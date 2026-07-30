"use client";

import * as React from "react";
import { ArrowUpDown, ChevronDown } from "lucide-react";
import { SendToken, SendTokenSelector } from "./send-token-selector";
import { TokenIcon } from "../../components/token-icon";
import { getChainOrDefault } from "@/lib/chains/registry";

interface SendAmountInputProps {
    token: SendToken | null;
    tokens: SendToken[];
    tokenAmount: string;
    usdAmount: string;
    inputMode: "usd" | "token";
    onTokenChange: (token: SendToken) => void;
    onTokenAmountChange: (val: string) => void;
    onUsdAmountChange: (val: string) => void;
    onToggleMode: () => void;
    solPrice?: number | null;
}

export function SendAmountInput({
    token,
    tokens,
    tokenAmount,
    usdAmount,
    inputMode,
    onTokenChange,
    onTokenAmountChange,
    onUsdAmountChange,
    onToggleMode,
    solPrice,
}: SendAmountInputProps) {
    const [selectorOpen, setSelectorOpen] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Focus input when clicking the amount area
    const focusInput = () => inputRef.current?.focus();

    const displayAmount = inputMode === "usd" ? usdAmount : tokenAmount;
    const secondaryAmount = inputMode === "usd"
        ? `${tokenAmount || "0"} ${token?.symbol ?? ""}`
        : `$${usdAmount || "0"}`;

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (inputMode === "usd") onUsdAmountChange(val);
        else onTokenAmountChange(val);
    };

    // Named only when it isn't Solana — Solana is the default and labelling
    // every row with it would be noise.
    const network = token?.chain && getChainOrDefault(token.chain).kind !== "solana"
        ? getChainOrDefault(token.chain).name
        : null;

    const balance = token?.balance ?? 0;
    const balanceUsd = token?.usdValue;
    const balanceStr = balance < 0.0001 && balance > 0
        ? "<0.0001"
        : balance.toLocaleString(undefined, { maximumFractionDigits: 6 });

    return (
        <>
            <div
                className="bg-[#1b1b1c] cursor-pointer border border-zinc-800/60 rounded-[24px] overflow-hidden select-none"
                onClick={focusInput}
            >
                {/* Amount section */}
                <div className="px-5 pt-5 pb-4">
                    <p className="text-[13px] font-medium text-zinc-500 mb-5">You're sending</p>

                    {/* Large amount display */}
                    <div className="flex items-center justify-center min-h-[72px] relative overflow-hidden">
                        <div className="flex items-center">
                            {inputMode === "usd" && (
                                <span className="text-[56px] font-semibold text-zinc-600 leading-none select-none mr-2">$</span>
                            )}
                            <div className="relative inline-block">
                                {/* Invisible shadow to measure width */}
                                <span className={`invisible absolute whitespace-pre font-semibold ${displayAmount && displayAmount.length > 6 ? "text-[40px]" : "text-[56px]"}`}>
                                    {displayAmount || "0"}
                                </span>
                                <input
                                    ref={inputRef}
                                    type="number"
                                    inputMode="decimal"
                                    value={displayAmount}
                                    onChange={handleInput}
                                    placeholder="0"
                                    className={`bg-transparent outline-none text-left font-semibold leading-none text-white placeholder-zinc-700 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-w-[20px] max-w-[280px] ${displayAmount && displayAmount.length > 6 ? "text-[40px]" : "text-[56px]"
                                        }`}
                                    style={{ width: `${Math.max(20, (displayAmount?.length || 1) * (displayAmount && displayAmount.length > 6 ? 24 : 34))}px` }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Secondary amount + toggle */}
                    <div className="flex items-center justify-center gap-1.5 mt-3">
                        <span className="text-[14px] font-medium text-zinc-500">{secondaryAmount}</span>
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleMode(); }}
                            className="cursor-pointer p-0.5 rounded-full text-zinc-500 hover:text-zinc-300 transition-colors"
                            aria-label="Toggle input mode"
                        >
                            <ArrowUpDown className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* Divider */}
                <div className="border-t border-zinc-800/60" />

                {/* Token selector row */}
                <button
                    onClick={(e) => { e.stopPropagation(); setSelectorOpen(true); }}
                    className="cursor-pointer w-full flex items-center gap-3 px-5 py-4 hover:bg-zinc-800/20 transition-colors"
                >
                    {/* Logo, badged with its network — which asset is selected
                        decides which chain the send goes out on. */}
                    <TokenIcon
                        src={token?.icon}
                        symbol={token?.symbol}
                        size="md"
                        type="token"
                        chain={token?.chain}
                        isNative={!!token?.mint.startsWith("native:")}
                    />

                    {/* Name + balance */}
                    <div className="flex-1 text-left min-w-0">
                        <p className="text-[15px] font-semibold text-white leading-tight">
                            {token?.symbol ?? "—"}
                            {network && <span className="text-zinc-500 font-medium"> on {network}</span>}
                        </p>
                        <p className="text-[12px] text-zinc-500 leading-tight">
                            Balance: {balanceStr}
                            {balanceUsd !== undefined && ` ($${balanceUsd.toFixed(2)})`}
                        </p>
                    </div>

                    <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                </button>
            </div>

            <SendTokenSelector
                open={selectorOpen}
                onClose={() => setSelectorOpen(false)}
                tokens={tokens}
                selectedMint={token?.mint ?? ""}
                onSelect={onTokenChange}
            />
        </>
    );
}
