"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { FlashIcon, SecurityCheckIcon } from "@hugeicons/core-free-icons";
import * as React from "react";

export function BuyInfoCards() {
    return (
        <div className="space-y-1">
            <div className="flex items-start gap-3 rounded-3xl border border-baseborder/20 bg-panel2 p-4">
                <div className="mt-0.5 grid size-8 place-items-center rounded-full bg-white/[0.06]">
                    <HugeiconsIcon icon={SecurityCheckIcon} className="size-4 text-zinc-300" />
                </div>
                <div>
                    <p className="text-14 font-bold tracking-tight text-white">Secure checkout</p>
                    <p className="text-12 font-medium leading-relaxed text-zinc-500">
                        Transactions are secured by MoonPay with encrypted processing.
                    </p>
                </div>
            </div>

            <div className="flex items-start gap-3 rounded-3xl border border-baseborder/20 bg-panel2 p-4">
                <div className="mt-0.5 grid size-8 place-items-center rounded-full bg-white/[0.06]">
                    <HugeiconsIcon icon={FlashIcon} className="size-4 text-zinc-300" />
                </div>
                <div>
                    <p className="text-14 font-bold tracking-tight text-white">Instant delivery</p>
                    <p className="text-12 font-medium leading-relaxed text-zinc-500">
                        SOL will be sent directly to your wallet once confirmed.
                    </p>
                </div>
            </div>
        </div>
    );
}
