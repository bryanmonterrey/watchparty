import { cache } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { tokens } from "@/db/schema/content";
import { eq, or } from "drizzle-orm";
import { TokenProfile } from "@/components/tokens/token-profile";

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

export async function generateMetadata({ params }: { params: Promise<{ mint: string }> }): Promise<Metadata> {
    const { mint } = await params;

    const token = await getToken(mint);
    if (token) {
        return { title: `${token.name} ($${token.ticker})` };
    }

    return { title: "Not Found" };
}

export default async function CoinPage({ params }: { params: Promise<{ mint: string }> }) {
    const { mint } = await params;

    const token = await getToken(mint);
    if (!token) notFound();

    return <TokenProfile token={token} />;
}
