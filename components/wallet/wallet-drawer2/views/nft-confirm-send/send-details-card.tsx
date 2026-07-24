"use client";

import { shortenWalletAddress } from "@/lib/utils";

interface SendDetailsCardProps {
    recipientAddress: string;
    recipientDisplay: string;
}

export function SendDetailsCard({ recipientAddress, recipientDisplay }: SendDetailsCardProps) {
    return (
        <div className="w-full bg-zinc-900/40 border border-white/5 rounded-[24px] overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
                <span className="text-[14px] text-zinc-500 font-medium">To</span>
                <span className="text-[14px] text-white font-bold truncate max-w-[180px]">
                    {recipientDisplay} ({shortenWalletAddress(recipientAddress)})
                </span>
            </div>
            <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
                <span className="text-[14px] text-zinc-500 font-medium">Network</span>
                <span className="text-[14px] text-white font-bold">Solana</span>
            </div>
            <div className="px-5 py-4 flex justify-between items-center">
                <span className="text-[14px] text-zinc-500 font-medium">Network fee</span>
                <span className="text-[14px] text-white font-bold">$0.0075</span>
            </div>
        </div>
    );
}
