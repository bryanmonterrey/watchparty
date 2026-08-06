"use client";

import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import { Check, X, ArrowRight, ArrowUpRight } from "lucide-react";
import { Squircle } from "@/components/ui/squircle";

export type SwapToastStep = "building" | "signing" | "confirming" | "success" | "error";

interface SwapToastData {
    step: SwapToastStep;
    inputSymbol: string;
    outputSymbol: string;
    inputAmount: string;
    outputAmount: string;
    inputIcon?: string;
    outputIcon?: string;
    txHash?: string;
    /** Overrides the default Solana tx viewer — EVM swaps pass their chain's
     *  explorer here so "View tx" doesn't point an 0x hash at orbmarkets. */
    explorerUrl?: string;
    error?: string;
}

const TOAST_ID = "swap-tx";

const STEPS: SwapToastStep[] = ["building", "signing", "confirming"];

const STEP_LABEL: Record<SwapToastStep, string> = {
    building:   "Building transaction...",
    signing:    "Waiting for signature...",
    confirming: "Confirming on-chain...",
    success:    "Swap complete!",
    error:      "Swap failed",
};

function TokenPill({ symbol, icon }: { symbol: string; icon?: string }) {
    return (
        <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full overflow-hidden bg-zinc-700 shrink-0 flex items-center justify-center">
                {icon ? (
                    <img src={icon} alt={symbol} className="w-full h-full object-cover" />
                ) : (
                    <span className="text-[8px] font-bold text-zinc-400">{symbol.slice(0, 2)}</span>
                )}
            </div>
            <span className="text-[13px] font-semibold text-white">{symbol}</span>
        </div>
    );
}

function SwapToastContent({
    data,
    toastId,
}: {
    data: SwapToastData;
    toastId: string | number;
}) {
    const { step, inputSymbol, outputSymbol, inputAmount, outputAmount, inputIcon, outputIcon, txHash, error } = data;
    const isPending = step === "building" || step === "signing" || step === "confirming";
    const isSuccess = step === "success";
    const isError = step === "error";
    const activeStepIdx = STEPS.indexOf(step as SwapToastStep);

    return (
        // Squircled glass per the app's toast standard: translucent black over
        // backdrop blur, no border (the clip-path would eat it anyway) and no
        // gray drop shadow — the blur separates it from the page.
        <Squircle asChild radius={24} autoEffects={false}>
        <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="w-[300px] bg-black/45 backdrop-blur-lg p-4 flex flex-col gap-3"
        >
            {/* Token pair + dismiss */}
            <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <TokenPill symbol={inputSymbol} icon={inputIcon} />
                    <div className="flex flex-col items-center shrink-0">
                        <ArrowRight className="w-3.5 h-3.5 text-zinc-600" />
                    </div>
                    <TokenPill symbol={outputSymbol} icon={outputIcon} />
                </div>
                <button
                    onClick={() => toast.dismiss(toastId)}
                    className="p-1 rounded-full text-zinc-600 hover:text-zinc-400 transition-colors shrink-0 cursor-pointer"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Amounts */}
            <p className="text-[12px] text-zinc-500">
                {inputAmount} {inputSymbol} → {outputAmount} {outputSymbol}
            </p>

            {/* Status row */}
            <div className="flex items-center gap-2.5">
                <AnimatePresence mode="wait">
                    {isPending && (
                        <motion.div
                            key="pulse"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 28 }}
                            className="w-2 h-2 rounded-full bg-[#A7A9FF] animate-pulse shrink-0"
                        />
                    )}
                    {isSuccess && (
                        <motion.div
                            key="check"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 22 }}
                            className="w-4 h-4 rounded-full bg-[#10B981] flex items-center justify-center shrink-0"
                        >
                            <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                        </motion.div>
                    )}
                    {isError && (
                        <motion.div
                            key="error"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{ type: "spring", stiffness: 500, damping: 22 }}
                            className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center shrink-0"
                        >
                            <X className="w-2.5 h-2.5 text-black" strokeWidth={3} />
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence mode="wait">
                    <motion.span
                        key={step}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 4 }}
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className={`text-[13px] font-medium flex-1 ${
                            isSuccess ? "text-[#10B981]" : isError ? "text-red-400" : "text-zinc-300"
                        }`}
                    >
                        {isError ? (error ?? STEP_LABEL.error) : STEP_LABEL[step]}
                    </motion.span>
                </AnimatePresence>

                <AnimatePresence>
                    {isSuccess && txHash && (
                        <motion.a
                            key="solscan"
                            href={data.explorerUrl ?? `https://orbmarkets.io/tx/${txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            initial={{ opacity: 0, x: 8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.1, duration: 0.2, ease: "easeOut" }}
                            className="flex items-center gap-1 text-[12px] text-[#A7A9FF] hover:opacity-80 transition-opacity font-medium shrink-0"
                        >
                            View tx
                            <ArrowUpRight className="w-3 h-3" />
                        </motion.a>
                    )}
                </AnimatePresence>
            </div>

            {/* Step progress dots */}
            <AnimatePresence>
                {isPending && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center gap-1.5"
                    >
                        {STEPS.map((s, i) => (
                            <motion.div
                                key={s}
                                animate={{
                                    width: step === s ? 20 : 8,
                                    backgroundColor: i <= activeStepIdx ? "#00ED89" : "#3f3f46",
                                }}
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                className="h-1 rounded-full"
                            />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
        </Squircle>
    );
}

function render(data: SwapToastData) {
    toast.custom((id) => <SwapToastContent data={data} toastId={id} />, {
        id: TOAST_ID,
        duration: data.step === "success" ? 5000 : Infinity,
    });
}

export function debugSwapToast(step: SwapToastStep, txHash?: string, error?: string) {
    render({ inputSymbol: "SOL", outputSymbol: "USDC", inputAmount: "1.5", outputAmount: "214.32", step, txHash, error });
}

export function showSwapToast(opts: {
    inputSymbol: string;
    outputSymbol: string;
    inputAmount: string;
    outputAmount: string;
    inputIcon?: string;
    outputIcon?: string;
}) {
    const base = { ...opts };
    render({ ...base, step: "building" });

    return {
        setStep: (step: SwapToastStep) => render({ ...base, step }),
        success: (txHash?: string, explorerUrl?: string) => render({ ...base, step: "success", txHash, explorerUrl }),
        error: (message?: string) => render({ ...base, step: "error", error: message }),
        dismiss: () => toast.dismiss(TOAST_ID),
    };
}
