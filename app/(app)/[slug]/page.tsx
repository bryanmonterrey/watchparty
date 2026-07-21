import { cache } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { tokens } from "@/db/schema/content";
import { follows } from "@/db/schema/content/follow";
import { count, eq, or } from "drizzle-orm";
import { UserProfile } from "@/components/profile/user-profile";
import { TokenProfile } from "@/components/tokens/token-profile";

// Port of sidebar's (browse)/[slug]/page.tsx — a top-level slug resolves to
// either a user profile or a token page.

// cache() dedupes across generateMetadata + the page within one request —
// Next only dedupes fetch(), not raw Drizzle calls.
const getUserBySlug = cache((slug: string) =>
    db.query.user.findFirst({
        where: eq(user.username, slug),
    })
);

const getTokenBySlug = cache((slug: string) =>
    db.query.tokens.findFirst({
        where: or(eq(tokens.id, slug), eq(tokens.tokenAddress, slug)),
        with: { creator: true },
    })
);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params;

    const userProfile = await getUserBySlug(slug);
    if (userProfile) {
        return { title: `@${userProfile.username}` };
    }

    const tokenProfile = await getTokenBySlug(slug);
    if (tokenProfile) {
        return { title: `${tokenProfile.name} ($${tokenProfile.ticker})` };
    }

    return { title: "Not Found" };
}

export default async function SlugPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;

    // 1. User profile
    const userProfile = await getUserBySlug(slug);
    if (userProfile) {
        // Follow counts ride in server-side so the header never shows a
        // second skeleton phase after the route skeleton swaps out.
        const [followerResult, followingResult] = await Promise.all([
            db.select({ count: count() }).from(follows).where(eq(follows.followingId, userProfile.id)),
            db.select({ count: count() }).from(follows).where(eq(follows.followerId, userProfile.id)),
        ]);
        return (
            <UserProfile
                user={userProfile}
                initialFollowCounts={{
                    followers: followerResult[0]?.count ?? 0,
                    following: followingResult[0]?.count ?? 0,
                }}
            />
        );
    }

    // 2. Token (by ID for drafts, or by address for live)
    const tokenProfile = await getTokenBySlug(slug);
    if (tokenProfile) {
        return <TokenProfile token={tokenProfile} />;
    }

    notFound();
}
