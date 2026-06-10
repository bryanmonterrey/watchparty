import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { posts } from "@/db/schema/content";
import { eq, and, isNotNull } from "drizzle-orm";
import { VideoWatchPage } from "@/components/video/video-watch-page";
import { StreamWatchPage } from "@/components/streaming/stream-watch-page";

// Port of sidebar's (browse)/[slug]/[videoId]/page.tsx.
// /<username>/live → live stream; /<username>/<postId> → VOD watch page.
// Only the rendered branch's client chunk ships — the server decides which.

interface Params {
    slug: string;
    videoId: string;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
    const { slug, videoId } = await params;

    if (videoId === "live") {
        const creator = await db.query.user.findFirst({ where: eq(user.username, slug) });
        if (!creator) return { title: "Not Found" };
        return { title: `${creator.name ?? slug} — Live` };
    }

    const post = await db.query.posts.findFirst({
        where: and(eq(posts.id, videoId), isNotNull(posts.videoUrl)),
    });
    if (!post) return { title: "Not Found" };

    return {
        title: post.title ?? "Video",
        description: post.content?.slice(0, 160) ?? undefined,
        openGraph: post.thumbnailUrl
            ? { images: [{ url: post.thumbnailUrl }] }
            : undefined,
    };
}

export default async function VideoPage({ params }: { params: Promise<Params> }) {
    const { slug, videoId } = await params;

    const creator = await db.query.user.findFirst({ where: eq(user.username, slug) });
    if (!creator) notFound();

    if (videoId === "live") {
        return <StreamWatchPage host={creator} />;
    }

    const post = await db.query.posts.findFirst({
        where: and(
            eq(posts.id, videoId),
            eq(posts.userId, creator.id),
            isNotNull(posts.videoUrl),
        ),
    });
    if (!post) notFound();

    return (
        <VideoWatchPage
            postId={videoId}
            creatorUsername={creator.username ?? slug}
        />
    );
}
