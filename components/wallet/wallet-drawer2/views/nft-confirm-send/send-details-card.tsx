"use client";

import { shortenWalletAddress } from "@/lib/utils";

interface SendDetailsCardProps {
    recipientAddress: string;
    recipientDisplay: string;
}

export function SendDetailsCard({ recipientAddress, recipientDisplay }: SendDetailsCardProps) {
    return (
        // The "Network fee $0.0075" row is gone. Nothing computed it — it was a
        // constant printed next to a real recipient and a real network, which
        // is the one place on the screen a made-up number can cost money.
        // Re-add it when the confirm step actually quotes a fee.
        <div className="w-full overflow-hidden rounded-3xl border border-baseborder/20 bg-panel2 py-1.5">
            <div className="flex items-center justify-between gap-4 px-5 py-3">
                <span className="shrink-0 text-13 font-medium text-zinc-500">To</span>
                <span className="min-w-0 truncate text-14 font-semibold text-white">
                    {recipientDisplay} ({shortenWalletAddress(recipientAddress)})
                </span>
            </div>
            <div className="flex items-center justify-between gap-4 px-5 py-3">
                <span className="shrink-0 text-13 font-medium text-zinc-500">Network</span>
                <span className="text-14 font-semibold text-white">Solana</span>
            </div>
        </div>
    );
}
