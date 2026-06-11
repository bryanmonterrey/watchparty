import { cache } from "react";
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

// cache() dedupes across generateMetadata + the page within one request —
// Next only dedupes fetch(), not raw Drizzle calls. The creator-ownership
// check lives in the page (JS), not the query, so both callers share one
// post lookup.
const getCreator = cache((slug: string) =>
    db.query.user.findFirst({ where: eq(user.username, slug) })
);

const getVideoPost = cache((videoId: string) =>
    db.query.posts.findFirst({
        where: and(eq(posts.id, videoId), isNotNull(posts.videoUrl)),
    })
);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
    const { slug, videoId } = await params;

    if (videoId === "live") {
        const creator = await getCreator(slug);
        if (!creator) return { title: "Not Found" };
        return { title: `${creator.name ?? slug} — Live` };
    }

    const post = await getVideoPost(videoId);
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

    const creator = await getCreator(slug);
    if (!creator) notFound();

    if (videoId === "live") {
        return <StreamWatchPage host={creator} />;
    }

    const post = await getVideoPost(videoId);
    if (!post || post.userId !== creator.id) notFound();

    return (
        <VideoWatchPage
            postId={videoId}
            creatorUsername={creator.username ?? slug}
        />
    );
}
