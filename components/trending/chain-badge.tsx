"use client";

import { cn } from "@/lib/utils";
import { chainLabel } from "@/lib/coin-feed/networks";

// Chain marker for a trending row: the chain's own logo, no wordmark.
//
// The URLs are CoinGecko's asset-platform images, resolved once (their
// /asset_platforms endpoint, keyed off the coingecko_asset_platform_id that
// GeckoTerminal reports per network) and baked in here rather than fetched at
// runtime — they're stable, and a per-render lookup would be an extra request
// and another failure mode for a 14px image. Refresh by re-reading that
// endpoint if a logo ever 404s.
//
// The chain name stays as the alt/title text, so the information is still
// available to a screen reader and on hover without spending row width on it.

const CHAIN_IMAGES: Record<string, string> = {
    solana: "https://coin-images.coingecko.com/asset_platforms/images/5/small/solana.png?1706606708",
    eth: "https://coin-images.coingecko.com/asset_platforms/images/279/small/ethereum.png?1706606803",
    base: "https://coin-images.coingecko.com/asset_platforms/images/131/small/base.png?1759905869",
    bsc: "https://coin-images.coingecko.com/asset_platforms/images/1/small/bnb_smart_chain.png?1706606721",
    arbitrum: "https://coin-images.coingecko.com/asset_platforms/images/33/small/AO_logomark.png?1706606717",
    polygon_pos: "https://coin-images.coingecko.com/asset_platforms/images/15/small/polygon_pos.png?1706606645",
    avax: "https://coin-images.coingecko.com/asset_platforms/images/12/small/avalanche.png?1706606775",
    optimism: "https://coin-images.coingecko.com/asset_platforms/images/41/small/optimism.png?1706606778",
    ton: "https://coin-images.coingecko.com/asset_platforms/images/142/small/tonblockchain.jpeg?1706606805",
    "sui-network": "https://coin-images.coingecko.com/asset_platforms/images/126/small/sui-ocean-square.png?1727791325",
    aptos: "https://coin-images.coingecko.com/asset_platforms/images/116/small/aptos_round.png?1706606789",
    "sei-network": "https://coin-images.coingecko.com/asset_platforms/images/148/small/Sei_Logo_-_Transparent.png?1706606762",
    hyperevm: "https://coin-images.coingecko.com/asset_platforms/images/22208/small/hyperliquid.jpg?1740125774",
    berachain: "https://coin-images.coingecko.com/asset_platforms/images/176/small/berachain.jpeg?1706606828",
    blast: "https://coin-images.coingecko.com/asset_platforms/images/192/small/blast.jpeg?1709085131",
    linea: "https://coin-images.coingecko.com/asset_platforms/images/135/small/linea.jpeg?1706606705",
    tron: "https://coin-images.coingecko.com/asset_platforms/images/1094/small/TRON_LOGO.png?1706606652",
    unichain: "https://coin-images.coingecko.com/asset_platforms/images/22206/small/unichain.png?1739323630",
    sonic: "https://coin-images.coingecko.com/asset_platforms/images/22192/small/128xS_token_Black-BG_2x.png?1735963719",
    abstract: "https://coin-images.coingecko.com/asset_platforms/images/22196/small/abstract.jpg?1735611808",
    robinhood: "https://coin-images.coingecko.com/asset_platforms/images/102132299/small/robinhood.png?1782921203",
};

/**
 * Mobula's chain slugs → the GeckoTerminal ones this table is keyed by.
 *
 * The board used to be GT-sourced, so every key above is a GT slug. It is
 * Mobula-sourced now, and the two vendors disagree on exactly the chains that
 * were showing a coloured dot instead of a logo: `ethereum` vs `eth`, `bnb` vs
 * `bsc`, `polygon` vs `polygon_pos`. `solana`, `base` and `hyperevm` happen to
 * match in both, which is why some rows looked right and made the rest read as
 * a missing-image problem rather than a naming one.
 *
 * An alias layer rather than duplicate entries: the URL for a chain lives once,
 * and a third vendor later is a few more lines here instead of a second table.
 */
const SLUG_ALIASES: Record<string, string> = {
    ethereum: "eth",
    bnb: "bsc",
    polygon: "polygon_pos",
    avalanche: "avax",
    sui: "sui-network",
    sei: "sei-network",
};

/** Chains with no logo mapped still need to be distinguishable, so they fall
 *  back to a stable colour hashed off the slug. */
const FALLBACK = ["#8A919E", "#A78BFA", "#F472B6", "#FBBF24", "#34D399"];
function colorFor(network: string) {
    let h = 0;
    for (let i = 0; i < network.length; i++) h = (h * 31 + network.charCodeAt(i)) >>> 0;
    return FALLBACK[h % FALLBACK.length];
}

export function ChainBadge({ network, className }: { network: string; className?: string }) {
    const src = CHAIN_IMAGES[network] ?? CHAIN_IMAGES[SLUG_ALIASES[network] ?? ""];
    const label = chainLabel(network);

    if (!src) {
        return (
            <span
                title={label}
                aria-label={label}
                className={cn("inline-block size-3 shrink-0 rounded-xs", className)}
                style={{ backgroundColor: colorFor(network) }}
            />
        );
    }

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt={label}
            title={label}
            loading="lazy"
            className={cn("size-5 shrink-0 rounded-sm object-cover", className)}
        />
    );
}
