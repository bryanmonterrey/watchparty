"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, CancelCircleIcon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import * as React from "react";
import { motion, AnimatePresence } from "motion/react";

export type SwapStep = "building" | "signing" | "confirming" | "success" | "error";

interface SwapStatusProps {
    step: SwapStep;
    inputSymbol: string;
    outputSymbol: string;
    inputAmount: string;
    outputAmount: string;
    error?: string;
    onDone: () => void;
}

const STEP_CONFIG: Record<SwapStep, { label: string; sublabel?: string }> = {
    building:   { label: "Building transaction",  sublabel: "Preparing your swap route..." },
    signing:    { label: "Sign transaction",       sublabel: "Approve in your wallet" },
    confirming: { label: "Confirming on-chain",    sublabel: "Waiting for Solana confirmation..." },
    success:    { label: "Swap complete",          sublabel: undefined },
    error:      { label: "Swap failed",            sublabel: undefined },
};

export function SwapStatus({ step, inputSymbol, outputSymbol, inputAmount, outputAmount, error, onDone }: SwapStatusProps) {
    const isPending = step === "building" || step === "signing" || step === "confirming";
    const isSuccess = step === "success";
    const isError   = step === "error";
    const config    = STEP_CONFIG[step];

    // Auto-dismiss after success
    React.useEffect(() => {
        if (isSuccess) {
            const t = setTimeout(onDone, 3000);
            return () => clearTimeout(t);
        }
    }, [isSuccess, onDone]);

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="rounded-3xl border border-baseborder/20 bg-panel2 p-5 flex flex-col gap-4"
            >
                {/* Token summary */}
                <div className="flex items-center justify-center gap-3 text-white font-semibold text-16">
                    <span>{inputAmount} {inputSymbol}</span>
                    <HugeiconsIcon icon={ArrowRight01Icon} className="w-4 h-4 text-zinc-500 shrink-0" />
                    <span>{outputAmount} {outputSymbol}</span>
                </div>

                {/* Status row */}
                <div className="flex items-center gap-3">
                    {isPending && (
                        <div className="w-2 h-2 rounded-full bg-lantern animate-pulse shrink-0" />
                    )}
                    {isSuccess && (
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-5 h-5 text-lantern shrink-0" />
                    )}
                    {isError && (
                        <HugeiconsIcon icon={CancelCircleIcon} className="w-5 h-5 text-pastelred shrink-0" />
                    )}
                    <div className="flex flex-col">
                        <span className={`text-14 font-semibold ${isError ? "text-pastelred" : isSuccess ? "text-lantern" : "text-white"}`}>
                            {config.label}
                        </span>
                        {config.sublabel && (
                            <span className="text-12 text-zinc-500">{config.sublabel}</span>
                        )}
                        {isError && error && (
                            <span className="text-12 text-pastelred/80 mt-0.5 max-w-[240px] line-clamp-2">{error}</span>
                        )}
                    </div>
                </div>

                {/* Step dots for pending */}
                {isPending && (
                    <div className="flex items-center gap-2">
                        {(["building", "signing", "confirming"] as SwapStep[]).map((s) => (
                            <div
                                key={s}
                                className={`h-1 rounded-full transition-all duration-300 ${
                                    step === s
                                        ? "w-6 bg-lantern"
                                        : s === "building" || (s === "signing" && (step === "confirming"))
                                        ? "w-2 bg-zinc-600"
                                        : "w-2 bg-white/[0.12]"
                                }`}
                            />
                        ))}
                    </div>
                )}

                {(isError) && (
                    <button
                        onClick={onDone}
                        className="text-13 font-semibold text-zinc-400 hover:text-white transition-colors text-center"
                    >
                        Dismiss
                    </button>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
