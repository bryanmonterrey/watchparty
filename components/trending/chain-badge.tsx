"use client";

import { cn } from "@/lib/utils";
import { chainLabel } from "@/lib/coin-feed/networks";

// Chain marker for a trending row.
//
// No chain logos: shipping 20 brand SVGs for a 14px badge is a lot of bytes and
// a licensing question, and at this size a wordmark is more legible than a
// glyph anyway. Each chain gets a stable colour so the eye can group by chain
// while scanning, with the short name next to it.

const CHAIN_COLORS: Record<string, string> = {
    solana: "#14F195",
    eth: "#627EEA",
    base: "#0052FF",
    bsc: "#F0B90B",
    arbitrum: "#28A0F0",
    polygon_pos: "#8247E5",
    avax: "#E84142",
    optimism: "#FF0420",
    ton: "#0098EA",
    "sui-network": "#4DA2FF",
    aptos: "#06F7F7",
    "sei-network": "#9C1C1C",
    hyperevm: "#97FCE4",
    berachain: "#814625",
    blast: "#FCFC03",
    linea: "#61DFFF",
    tron: "#EF0027",
    unichain: "#FF007A",
    sonic: "#FE9A4C",
    abstract: "#1FE383",
};

/** Anything not in the table still gets a stable colour, hashed off its slug. */
const FALLBACK = ["#8A919E", "#A78BFA", "#F472B6", "#FBBF24", "#34D399"];
function colorFor(network: string) {
    if (CHAIN_COLORS[network]) return CHAIN_COLORS[network];
    let h = 0;
    for (let i = 0; i < network.length; i++) h = (h * 31 + network.charCodeAt(i)) >>> 0;
    return FALLBACK[h % FALLBACK.length];
}

export function ChainBadge({ network, className }: { network: string; className?: string }) {
    return (
        <span
            className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold text-zinc-400",
                className,
            )}
        >
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: colorFor(network) }} />
            {chainLabel(network)}
        </span>
    );
}

export { colorFor as chainColor };
