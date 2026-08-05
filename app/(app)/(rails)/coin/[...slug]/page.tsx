import { cache } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { tokens } from "@/db/schema/content";
import { eq, or } from "drizzle-orm";
import { TokenProfile } from "@/components/tokens/token-profile";
import { CoinDetail } from "@/components/coins/coin-detail";
import { resolveCoin } from "@/lib/coins/resolve";

// Coin pages live here, not at the top level. They used to share `/[slug]` with
// user profiles — one route resolving a string to EITHER a user or a token —
// which meant a username and a mint address were the same namespace, and the
// header had to guess which page it was on by string length
// (`firstSegment.length >= 21`). Splitting them makes `/[username]` mean a
// person and `/coin/<mint>` mean a coin.
//
// The route accepts BOTH keys, same as the old shared route: live coins are
// linked by on-chain address, but a DRAFT has no address yet and is linked by
// its row id (see the token-first-buy model — content creates a draft before
// anyone has bought it).
//
// A CATCH-ALL, so the chain is optional:
//
//   /coin/<address>          — resolve the chain (the existing form; every link
//                              already out there, and every shared URL)
//   /coin/<chain>/<address>  — unambiguous, no resolution needed
//
// The chain-qualified form exists because the same address can live on several
// chains, and an address alone can't say which. Dexscreener puts the chain in
// its URLs for exactly this reason. Optional rather than required: making it
// mandatory would break every link already published.

// cache() dedupes across generateMetadata + the page within one request —
// Next only dedupes fetch(), not raw Drizzle calls.
const getToken = cache((mint: string) =>
    db.query.tokens.findFirst({
        where: or(eq(tokens.id, mint), eq(tokens.tokenAddress, mint)),
        with: { creator: true },
    })
);

// Same dedupe for the fallback lookup, so a coin we didn't launch costs one
// resolve per request rather than one for the title and one for the body.
const getCoin = cache((address: string, network?: string) => resolveCoin(address, network));

/** `[address]` or `[chain, address]` — the address is always last. Anything
 *  longer isn't a coin URL. */
function parseSlug(slug: string[]): { address: string; network?: string } | null {
    if (slug.length === 1) return { address: slug[0] };
    if (slug.length === 2) return { network: slug[0], address: slug[1] };
    return null;
}

type Params = { params: Promise<{ slug: string[] }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
    const { slug } = await params;
    const parsed = parseSlug(slug);
    if (!parsed) return { title: "not found" };

    const token = await getToken(parsed.address);
    if (token) {
        return { title: `${token.name} ($${token.ticker})` };
    }

    const coin = await getCoin(parsed.address, parsed.network);
    if (coin) {
        return { title: coin.name ? `${coin.name} ($${coin.symbol})` : `$${coin.symbol}` };
    }

    return { title: "not found" };
}

/**
 * Any coin, any chain.
 *
 * A coin WE launched has a `tokens` row and gets the full profile — creator,
 * bonding curve, chat, holders. Everything else resolves through
 * lib/coins/resolve (trending board → alert watch list → coin_index →
 * Dexscreener) and gets the coin view: identity, market stats, chart, swap.
 * Same component the chart overlay renders, so the two can't drift.
 *
 * Only an address Dexscreener has never heard of is a 404 now. Before this, ANY
 * coin we hadn't launched 404'd — which was every one of the 162 coins on the
 * trending board, and every coin the alert feed reports.
 */
export default async function CoinPage({ params }: Params) {
    const { slug } = await params;
    const parsed = parseSlug(slug);
    if (!parsed) notFound();

    const token = await getToken(parsed.address);
    if (token) return <TokenProfile token={token} />;

    const coin = await getCoin(parsed.address, parsed.network);
    if (!coin) notFound();

    // No pt-header wrapper: the dock inside CoinDetail is a sticky h-screen
    // column, and offsetting it pushes its bottom that far past the viewport.
    // The clearance lives on the content column instead.
    return <CoinDetail coin={coin} />;
}
