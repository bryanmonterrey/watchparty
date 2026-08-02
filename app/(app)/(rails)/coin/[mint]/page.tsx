import { cache } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { tokens } from "@/db/schema/content";
import { eq, or } from "drizzle-orm";
import { TokenProfile } from "@/components/tokens/token-profile";
import { CoinDetail } from "@/components/home/coin-overlay";
import { resolveCoin } from "@/lib/coins/resolve";

// Coin pages live here, not at the top level. They used to share `/[slug]` with
// user profiles — one route resolving a string to EITHER a user or a token —
// which meant a username and a mint address were the same namespace, and the
// header had to guess which page it was on by string length
// (`firstSegment.length >= 21`). Splitting them makes `/[username]` mean a
// person and `/coin/<mint>` mean a coin.
//
// `[mint]` still accepts BOTH keys, same as the old shared route: live coins are
// linked by on-chain address, but a DRAFT has no address yet and is linked by
// its row id (see the token-first-buy model — content creates a draft before
// anyone has bought it).

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
const getCoin = cache((mint: string) => resolveCoin(mint));

export async function generateMetadata({ params }: { params: Promise<{ mint: string }> }): Promise<Metadata> {
    const { mint } = await params;

    const token = await getToken(mint);
    if (token) {
        return { title: `${token.name} ($${token.ticker})` };
    }

    const coin = await getCoin(mint);
    if (coin) {
        return { title: coin.name ? `${coin.name} ($${coin.symbol})` : `$${coin.symbol}` };
    }

    return { title: "Not Found" };
}

/**
 * Any coin, any chain.
 *
 * A coin WE launched has a `tokens` row and gets the full profile — creator,
 * bonding curve, chat, holders. Everything else resolves through
 * lib/coins/resolve (trending board → alert watch list → GeckoTerminal) and
 * gets the coin view: identity, market stats, chart, swap. Same component the
 * chart overlay renders, so the two can't drift.
 *
 * Only an address GT has never heard of is a 404 now. Before this, ANY coin we
 * hadn't launched 404'd — which was every one of the 162 coins on the trending
 * board, and every coin the alert feed reports.
 */
export default async function CoinPage({ params }: { params: Promise<{ mint: string }> }) {
    const { mint } = await params;

    const token = await getToken(mint);
    if (token) return <TokenProfile token={token} />;

    const coin = await getCoin(mint);
    if (!coin) notFound();

    return (
        <div className="w-full min-w-0 pt-header">
            <CoinDetail coin={coin} />
        </div>
    );
}
