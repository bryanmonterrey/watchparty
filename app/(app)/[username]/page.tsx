import { cache } from "react";
import { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { streams, tokens } from "@/db/schema/content";
import { follows } from "@/db/schema/content/follow";
import { count, eq, or } from "drizzle-orm";
import { UserProfile } from "@/components/profile/user-profile";
import { recordSlugMiss } from "@/lib/security/slug-miss-cache";
import { fallbackShareMetadata, shareMetadata } from "@/lib/share/metadata";
import { ogImage } from "@/lib/share/og-url";

// A top-level slug is a USERNAME and nothing else. Coins used to share this
// route — one string resolving to either a user or a token — and now live at
// `/coin/<mint>` (see app/(app)/coin/[mint]/page.tsx).
//
// Port of sidebar's (browse)/[slug]/page.tsx, minus that second branch.

// cache() dedupes across generateMetadata + the page within one request —
// Next only dedupes fetch(), not raw Drizzle calls.
const getUserBySlug = cache((slug: string) =>
    db.query.user.findFirst({
        where: eq(user.username, slug),
    })
);

// Legacy `/{mint}` links only. Coin URLs are already out in the world —
// trade-fanout and copy-executor wrote `/${mint}` into push notifications that
// have ALREADY been delivered to phones, and coin links get shared — so a miss
// here checks for a token before 404ing and forwards it to the new route.
// Costs one extra query only on the path that was going to be a 404 anyway.
const getTokenBySlug = cache((slug: string) =>
    db.query.tokens.findFirst({
        where: or(eq(tokens.id, slug), eq(tokens.tokenAddress, slug)),
        columns: { id: true, tokenAddress: true },
    })
);

// The live check the profile page opens on. Server-side deliberately: the page
// renders straight into the stream when its host is broadcasting, and finding
// that out on the client would mean painting the profile first and yanking it
// away a beat later.
const getStreamByUser = cache((userId: string) =>
    db.query.streams.findFirst({ where: eq(streams.userId, userId) })
);

// Shared with the page body (cache() dedupes), so the card's follower count
// costs no extra query.
const getFollowerCount = cache((userId: string) =>
    db.select({ count: count() }).from(follows).where(eq(follows.followingId, userId))
);

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
    const { username } = await params;

    const userProfile = await getUserBySlug(username);
    if (userProfile) {
        // Both are the page body's own lookups; a failure here just means a
        // card without that detail, never a missing card.
        const [stream, followerRows] = await Promise.all([
            getStreamByUser(userProfile.id).catch(() => null),
            getFollowerCount(userProfile.id).catch(() => null),
        ]);
        const handle = userProfile.username ?? username;
        const avatar = userProfile.avatar_url ?? userProfile.image;
        const verified = Boolean(userProfile.verifiedTier);

        // Live is a mode of this page (see below), so it is a mode of the card
        // too: the stream is what a shared link should sell while it is on.
        if (stream?.isLive) {
            return shareMetadata({
                title: stream.title || `${handle} is live`,
                description: [stream.category, `${userProfile.name} is live on watchparty`].filter(Boolean).join(" · "),
                path: `/${username}`,
                type: "profile",
                image: ogImage("live", {
                    name: userProfile.name,
                    username: handle,
                    avatar,
                    verified,
                    title: stream.title,
                    category: stream.category,
                    viewers: stream.viewerCount,
                    thumb: stream.thumbnailUrl,
                }),
            });
        }

        // No @ — the root template already reads "%s / watchparty", and
        // "@name / watchparty" put two sigils in a six-character tab.
        return shareMetadata({
            title: handle,
            description: userProfile.bio || `${userProfile.name} on watchparty`,
            path: `/${username}`,
            type: "profile",
            image: ogImage("profile", {
                name: userProfile.name,
                username: handle,
                avatar,
                bio: userProfile.bio,
                verified,
                followers: followerRows?.[0]?.count,
            }),
        });
    }

    return fallbackShareMetadata(`/${username}`, "not found");
}

export default async function UsernamePage({ params }: { params: Promise<{ username: string }> }) {
    const slug = (await params).username;

    // 1. User profile
    const userProfile = await getUserBySlug(slug);
    if (userProfile) {
        // Follow counts ride in server-side so the header never shows a
        // second skeleton phase after the route skeleton swaps out. They're
        // a non-critical stat: on a transient DB failure, render without
        // them and let the client query fetch (undefined = no initialData).
        let initialFollowCounts: { followers: number; following: number } | undefined;
        try {
            const [followerResult, followingResult] = await Promise.all([
                getFollowerCount(userProfile.id),
                db.select({ count: count() }).from(follows).where(eq(follows.followerId, userProfile.id)),
            ]);
            initialFollowCounts = {
                followers: followerResult[0]?.count ?? 0,
                following: followingResult[0]?.count ?? 0,
            };
        } catch (err) {
            console.error("[username] follow-count SSR failed, deferring to client:", err);
        }

        // Live is a MODE of this page now, not a route of its own. A broadcasting
        // host opens on their stream; the profile is one click away on the name.
        let initialIsLive = false;
        try {
            initialIsLive = (await getStreamByUser(userProfile.id))?.isLive ?? false;
        } catch (err) {
            console.error("[username] live check failed, opening on the profile:", err);
        }

        return (
            <UserProfile
                user={userProfile}
                initialFollowCounts={initialFollowCounts}
                initialIsLive={initialIsLive}
            />
        );
    }

    // 2. Not a user — but it may be an old coin link from before coins moved to
    // /coin/<mint>. Forward those instead of 404ing. 308: the move is permanent.
    const tokenProfile = await getTokenBySlug(slug);
    if (tokenProfile) {
        permanentRedirect(`/coin/${tokenProfile.tokenAddress ?? tokenProfile.id}`);
    }

    // Record the proven miss BEFORE 404ing, so middleware can answer the next
    // request for this slug with a real 404 instead of a full soft-404 render.
    // Only reached once both lookups have failed — a real username can never
    // land here, which is what makes a stale cache harmless.
    await recordSlugMiss(slug);

    notFound();
}
