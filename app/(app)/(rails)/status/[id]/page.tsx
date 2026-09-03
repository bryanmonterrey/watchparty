import { PostDetailView } from "@/components/browse/post-view";
import { db } from "@/db";
import { posts, tokens, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ogImage } from "@/lib/share/og-url";
import { formatClock } from "@/lib/utils";
import type { Metadata } from "next";
import { fallbackShareMetadata, shareMetadata } from "@/lib/share/metadata";

// Port of sidebar's (browse)/discover/post/[id]/page.tsx.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    try {
        const result = await db
            .select({
                content: posts.content,
                imageUrl: posts.imageUrl,
                media: posts.media,
                videoUrl: posts.videoUrl,
                thumbnailUrl: posts.thumbnailUrl,
                duration: posts.duration,
                likes: posts.likes,
                comments: posts.comments,
                reposts: posts.reposts,
                ticker: posts.ticker,
                tokenMcap: tokens.marketCapUsd,
                name: user.name,
                username: user.username,
                avatar: user.avatar_url,
                image: user.image,
                verifiedTier: user.verifiedTier,
            })
            .from(posts)
            .innerJoin(user, eq(posts.userId, user.id))
            .leftJoin(tokens, eq(posts.tokenId, tokens.id))
            .where(eq(posts.id, id))
            .limit(1);

        const post = result[0];
        if (!post) return fallbackShareMetadata(`/status/${id}`, "post not found");

        const media = post.media ?? [];
        const isVideo = Boolean(post.videoUrl) || media.some((m) => m.type === "video");
        // The hero: the post's image, else its first image attachment, else
        // the video's thumbnail. Nothing → the text variant.
        const hero = post.imageUrl ?? media.find((m) => m.type === "image")?.url ?? (isVideo ? post.thumbnailUrl : null);

        return shareMetadata({
            // Name and @handle are identity and keep their case; the brand
            // is dropped because the root template appends "/ watchparty"
            // already, and this read "... on Watchparty / watchparty".
            title: `${post.name} (@${post.username})`,
            description: post.content || "Check out this post on watchparty",
            path: `/status/${id}`,
            type: "article",
            image: ogImage("post", {
                text: post.content,
                name: post.name,
                username: post.username,
                avatar: post.avatar ?? post.image,
                verified: Boolean(post.verifiedTier),
                likes: post.likes,
                replies: post.comments,
                reposts: post.reposts,
                image: hero,
                video: isVideo,
                duration: isVideo && post.duration ? formatClock(post.duration) : undefined,
                ticker: post.ticker,
                mcap: post.tokenMcap,
            }),
        });
    } catch (error) {
        console.error("Error in generateMetadata:", error);
        return fallbackShareMetadata(`/status/${id}`, "post");
    }
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    return (
        <div className="w-full min-h-screen">
            <PostDetailView postId={id} />
        </div>
    );
}
