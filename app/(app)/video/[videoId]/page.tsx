import { cache } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { posts } from "@/db/schema/content";
import { and, eq, isNotNull } from "drizzle-orm";
import { VideoWatchPage } from "@/components/video/video-watch-page";

// Videos live at /video/<postId>, off the [slug] tree.
//
// The post id identifies the video by itself — the username in the old
// /<user>/<postId> URL was decoration that cost something real: every link had
// to have the author loaded to be built, and a rename broke every old link. The
// creator is looked up FROM the post here instead of being matched against it.
//
// Live is no longer a video route at all (/<user>/live is gone): a stream is a
// state of its host's profile page now. See components/profile/user-profile.tsx.

interface Params {
    videoId: string;
}

// cache() dedupes across generateMetadata + the page within one request — Next
// only dedupes fetch(), not raw Drizzle calls.
const getVideoPost = cache((videoId: string) =>
    db.query.posts.findFirst({
        where: and(eq(posts.id, videoId), isNotNull(posts.videoUrl)),
    })
);

const getCreator = cache((userId: string) =>
    db.query.user.findFirst({ where: eq(user.id, userId) })
);

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
    const { videoId } = await params;
    const post = await getVideoPost(videoId);
    if (!post) return { title: "Not Found" };

    return {
        title: post.title ?? "Video",
        description: post.content?.slice(0, 160) ?? undefined,
        openGraph: post.thumbnailUrl ? { images: [{ url: post.thumbnailUrl }] } : undefined,
    };
}

export default async function VideoPage({ params }: { params: Promise<Params> }) {
    const { videoId } = await params;

    const post = await getVideoPost(videoId);
    if (!post) notFound();

    // Only for the "video not found" fallback's link home — the watch page
    // fetches everything else it renders through content.getVideoById.
    const creator = await getCreator(post.userId);

    return <VideoWatchPage postId={videoId} creatorUsername={creator?.username ?? ""} />;
}
