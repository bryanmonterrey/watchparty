"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import { CopyIcon } from "@/components/icons";
import { getChainOrDefault } from "@/lib/chains/registry";
import { Token } from "../../types";
import { DrawerCard, DrawerDataRow } from "../../components/drawer-chrome";

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
        { label: "Name", value: token.name },
        { label: "Symbol", value: token.symbol },
        // The drawer holds coins on eight networks, so a hardcoded "Solana"
        // here was wrong on every EVM and Bitcoin row it rendered.
        { label: "Network", value: getChainOrDefault(token.chain ?? "solana").name },
        { label: "Market cap", value: token.marketCap ? formatLargeNumber(token.marketCap) : "—" },
        { label: "FDV", value: token.fdv ? formatLargeNumber(token.fdv) : "—" },
    ];

    // One card, rows separated by padding rather than by a hairline under each
    // — the banded `border-b border-white/5` look is what dated this screen.
    return (
        <DrawerCard className="py-1.5">
            {rows.map((row) => (
                <DrawerDataRow key={row.label} label={row.label}>
                    {row.value}
                </DrawerDataRow>
            ))}

            <DrawerDataRow label="Mint">
                <button onClick={copyMint} className="group flex cursor-pointer items-center gap-1.5">
                    <span className="font-semibold text-white">{truncateMint(token.mint)}</span>
                    <HugeiconsIcon
                        icon={Tick02Icon}
                        className={`size-3.5 text-lantern ${copied ? "" : "hidden"}`}
                        strokeWidth={2.5}
                    />
                    {!copied && (
                        <CopyIcon className="size-3.5 text-zinc-600 transition-colors group-hover:text-white" />
                    )}
                </button>
            </DrawerDataRow>
        </DrawerCard>
    );
}
