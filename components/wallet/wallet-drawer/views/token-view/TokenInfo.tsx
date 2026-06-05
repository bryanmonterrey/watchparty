"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { CopyIcon } from "@/components/icons";
import { Token } from "../../types";

interface TokenInfoProps {
    token: Token;
}

function formatLargeNumber(n: number): string {
    if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
    return `$${n.toFixed(2)}`;
}

function truncateMint(mint: string): string {
    return `${mint.slice(0, 4)}...${mint.slice(-4)}`;
}

export function TokenInfo({ token }: TokenInfoProps) {
    const [copied, setCopied] = React.useState(false);

    const copyMint = () => {
        navigator.clipboard.writeText(token.mint);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const rows = [
        { label: "Name",       value: token.name },
        { label: "Symbol",     value: token.symbol },
        { label: "Network",    value: "Solana" },
        { label: "Market Cap", value: token.marketCap ? formatLargeNumber(token.marketCap) : "—" },
        { label: "FDV",        value: token.fdv ? formatLargeNumber(token.fdv) : "—" },
    ];

    return (
        <div className="bg-gray1 rounded-[22px] overflow-hidden">
            {rows.map((row) => (
                <div
                    key={row.label}
                    className="flex items-center justify-between px-5 py-4 border-b border-white/5"
                >
                    <span className="text-lg font-bold text-zinc-500">{row.label}</span>
                    <span className="text-lg font-bold text-zinc-200">{row.value}</span>
                </div>
            ))}

            {/* Mint address — copyable */}
            <div className="flex items-center justify-between px-5 py-4">
                <span className="text-lg font-bold text-zinc-500">Mint</span>
                <button onClick={copyMint} className="flex items-center gap-1.5 cursor-pointer group">
                    <span className="text-lg font-bold text-zinc-200">
                        {truncateMint(token.mint)}
                    </span>
                    {copied
                        ? <Check className="w-3.5 h-3.5 text-[#00ED89]" />
                        : <CopyIcon className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                    }
                </button>
            </div>
        </div>
    );
}
