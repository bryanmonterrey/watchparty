"use client";

import * as React from "react";
import { TokenSelectorModal, Token } from "./token-selector-modal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { motion, AnimatePresence, type Variants } from "motion/react";
import { TokenIcon } from "../../components/token-icon";

interface SwapInputContainerProps {
    label: "Sell" | "Buy";
    amount: string;
    onAmountChange?: (val: string) => void;
    token: Token | null;
    onTokenSelect: (token: Token) => void;
    usdValue: string;
    balance?: string;
    readOnly?: boolean;
    jupiterTokens: Token[] | undefined;
    isLoadingTokens: boolean;
}

export function SwapInputContainer({
    label,
    amount,
    onAmountChange,
    token,
    onTokenSelect,
    usdValue,
    balance,
    readOnly,
    jupiterTokens,
    isLoadingTokens
}: SwapInputContainerProps) {
    const inputRef = React.useRef<HTMLInputElement>(null);
    // Canonical quick-select tokens identified by mint address (NOT symbol, to avoid matching fakes)
    // Popular mints for the quick-select hover buttons — icons come from Helius via jupiterTokens
    const POPULAR_MINTS = [
        "So11111111111111111111111111111111111111112", // SOL (wSOL — what Jupiter uses for swaps)
        "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
        "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", // WBTC
        "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",  // JUP
    ];

    const popularTokens = React.useMemo(() => {
        return POPULAR_MINTS
            .map(address => jupiterTokens?.find(t => t.address === address))
            .filter(Boolean) as Token[];
    }, [jupiterTokens]);

    const [isSellHovered, setIsSellHovered] = React.useState(false);
    const [isBuyHovered, setIsBuyHovered] = React.useState(false);

    // Animation variants for the container
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.05,
                staggerDirection: -1 as const,
            },
        },
    };

    // Animation variants for individual items
    const itemVariants: Variants = {
        hidden: { opacity: 0, scale: 1 },
        visible: {
            opacity: 1,
            scale: 1,
            transition: { type: "spring" as const, stiffness: 400, damping: 25 },
        },
    };

    return (
        <div
            className="group relative flex cursor-pointer flex-col gap-1.5 overflow-hidden rounded-3xl border border-baseborder/20 bg-panel2 p-4 transition-colors hover:bg-white/[0.09]"
            onClick={() => inputRef.current?.focus()}
            onMouseEnter={() => {
                if (label === "Sell") setIsSellHovered(true);
                if (label === "Buy") setIsBuyHovered(true);
            }}
            onMouseLeave={() => {
                if (label === "Sell") setIsSellHovered(false);
                if (label === "Buy") setIsBuyHovered(false);
            }}
        >
            <div className="flex justify-between items-center text-zinc-400 px-1">
                <span className="text-13 font-medium">{label}</span>
                {label === "Sell" && (
                    <div className="flex items-center gap-2 relative h-6 w-40 justify-end">
                        <AnimatePresence>
                            {isSellHovered && (
                                <motion.div
                                    variants={containerVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="hidden"
                                    className="flex items-center gap-2 z-10"
                                >
                                    {["25%", "50%", "75%", "Max"].map((percent) => (
                                        <motion.button
                                            key={percent}
                                            variants={itemVariants}
                                            className="cursor-pointer rounded-full bg-white/[0.08] px-2 py-0.5 text-11 font-semibold text-zinc-300 transition-colors hover:bg-white/[0.16] hover:text-white"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (!balance || !onAmountChange) return;
                                                const bal = parseFloat(balance.replace(/,/g, ""));
                                                if (isNaN(bal) || bal <= 0) return;
                                                const multiplier = percent === "Max" ? 1 : parseInt(percent) / 100;
                                                onAmountChange(String(bal * multiplier));
                                            }}
                                        >
                                            {percent}
                                        </motion.button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3">
                <input
                    ref={inputRef}
                    type={readOnly ? "text" : "number"}
                    value={amount}
                    onChange={(e) => onAmountChange?.(e.target.value)}
                    placeholder="0"
                    readOnly={readOnly}
                    className="flex-[2] bg-transparent cursor-pointer text-[40px] font-medium text-white outline-none w-0 h-14 placeholder:text-zinc-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    step="any"
                />

                <div className="flex-shrink-0 flex justify-end relative h-10 items-center">
                    {/* Hover Quick Select Tokens (Only on Buy) */}
                    {label === "Buy" && popularTokens.length > 0 && (
                        <AnimatePresence>
                            {isBuyHovered && (
                                <motion.div
                                    variants={containerVariants}
                                    initial="hidden"
                                    animate="visible"
                                    exit="hidden"
                                    className="absolute bottom-full right-0 mb-3 flex items-center justify-end gap-1.5 z-10 w-full"
                                >
                                    <TooltipProvider delayDuration={100}>
                                        {popularTokens.map((popularToken) => (
                                            <Tooltip key={popularToken.address}>
                                                <TooltipTrigger asChild>
                                                    <motion.button
                                                        variants={itemVariants}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onTokenSelect(popularToken);
                                                        }}
                                                        className="cursor-pointer w-7 h-7 min-w-[28px] shrink-0 rounded-full overflow-hidden hover:scale-110 hover:ring-2 hover:ring-white/20 transition-all flex items-center justify-center bg-white/[0.06] p-[2px]"
                                                    >
                                                        <TokenIcon
                                                            src={popularToken.logoURI}
                                                            symbol={popularToken.symbol}
                                                            size="sm"
                                                            type="token"
                                                        />
                                                    </motion.button>
                                                </TooltipTrigger>
                                                <TooltipContent className="relative z-50 border border-baseborder/20 bg-grokdropdown px-2 py-1.5 text-11 text-zinc-200">
                                                    {popularToken.symbol}
                                                </TooltipContent>
                                            </Tooltip>
                                        ))}
                                    </TooltipProvider>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    )}

                    {/* Main Selector */}
                    <div onClick={(e) => e.stopPropagation()}>
                        <TokenSelectorModal
                            type={label === "Sell" ? "input" : "output"}
                            selectedToken={token}
                            onSelectToken={onTokenSelect}
                            jupiterTokens={jupiterTokens}
                            isLoadingTokens={isLoadingTokens}
                        />
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center px-1 pt-0.5 opacity-80 h-5">
                <div className="text-13 text-zinc-500 font-medium">
                    {usdValue ? `$${usdValue}` : "$0.00"}
                </div>
                {balance && (
                    <div className="text-13 text-zinc-500 font-medium">
                        {balance}
                    </div>
                )}
            </div>
        </div>
    );
}
