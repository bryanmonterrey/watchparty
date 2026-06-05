"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { BuyAmountInput } from "./buy-amount-input";
import { BuyInfoCards } from "./buy-info-cards";

interface BuyViewProps {
    walletAddress: string;
    onBack: () => void;
}

export function BuyView({ walletAddress, onBack }: BuyViewProps) {
    const [amount, setAmount] = React.useState<string>("50");
    const [isGeneratingUrl, setIsGeneratingUrl] = React.useState(false);

    const buyUrlQuery = trpc.wallet.getMoonPayBuyUrl.useQuery(
        { amount: parseFloat(amount) || 50 },
        { enabled: false }
    );

    const handleBuy = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            toast.error("Please enter a valid amount");
            return;
        }

        setIsGeneratingUrl(true);
        try {
            const result = await buyUrlQuery.refetch();
            if (result.data?.url) {
                window.open(result.data.url, "_blank", "noopener,noreferrer");
                toast.success("Opening MoonPay...", {
                    description: "Please complete your purchase in the new tab."
                });
            } else {
                throw new Error("Failed to generate secure URL");
            }
        } catch (error) {
            console.error("MoonPay Error:", error);
            toast.error("Could not launch MoonPay. Please check your connection.");
        } finally {
            setIsGeneratingUrl(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="flex flex-col h-full"
        >
            {/* Header */}
            <div className="px-5 pt-5 pb-4 flex items-center relative flex-shrink-0">
                <button
                    onClick={onBack}
                    className="cursor-pointer p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors -ml-1 z-10"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <span className="text-[18px] font-semibold text-white absolute left-0 right-0 text-center pointer-events-none">
                    Buy SOL
                </span>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 pt-6 flex flex-col space-y-8">
                <BuyAmountInput
                    amount={amount}
                    onAmountChange={setAmount}
                />

                <BuyInfoCards />

                {/* Action */}
                <div className="mt-auto pb-6 pt-4">
                    <Button
                        onClick={handleBuy}
                        disabled={isGeneratingUrl}
                        className="w-full cursor-pointer h-14 rounded-full bg-white hover:bg-zinc-200 text-black text-[16px] font-bold shadow-xl shadow-white/5 disabled:opacity-50"
                    >
                        {isGeneratingUrl ? "Opening MoonPay..." : "Continue to MoonPay"}
                    </Button>
                    <p className="text-center text-[11px] text-zinc-600 mt-4 px-4 leading-relaxed">
                        By proceeding, you agree to MoonPay's Terms of Use. MoonPay is a third-party service.
                    </p>
                </div>
            </div>
        </motion.div>
    );
}

