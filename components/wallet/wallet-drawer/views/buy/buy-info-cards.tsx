"use client";

import * as React from "react";
import { ShieldCheck, Zap } from "lucide-react";

export function BuyInfoCards() {
    return (
        <div className="space-y-3">
            <div className="flex items-start space-x-3 p-4 bg-zinc-900/30 rounded-2xl border border-zinc-900">
                <div className="mt-0.5 p-2 bg-bleu/10 rounded-xl">
                    <ShieldCheck className="w-4 h-4 text-bleu" />
                </div>
                <div>
                    <p className="text-[14px] font-semibold text-white">Secure Checkout</p>
                    <p className="text-[12px] text-zinc-500 leading-relaxed">
                        Transactions are secured by MoonPay with encrypted processing.
                    </p>
                </div>
            </div>

            <div className="flex items-start space-x-3 p-4 bg-zinc-900/30 rounded-2xl border border-zinc-900">
                <div className="mt-0.5 p-2 bg-amber-500/10 rounded-xl">
                    <Zap className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                    <p className="text-[14px] font-semibold text-white">Instant Delivery</p>
                    <p className="text-[12px] text-zinc-500 leading-relaxed">
                        SOL will be sent directly to your wallet once confirmed.
                    </p>
                </div>
            </div>
        </div>
    );
}
