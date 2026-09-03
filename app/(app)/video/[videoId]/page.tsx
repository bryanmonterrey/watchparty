import { cache } from "react";
import { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { user } from "@/db/schema/auth";
import { posts } from "@/db/schema/content";
import { and, eq, isNotNull } from "drizzle-orm";
import { VideoWatchPage } from "@/components/video/video-watch-page";
import { fallbackShareMetadata, shareMetadata } from "@/lib/share/metadata";
import { compactCount } from "@/lib/utils";

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

/** 42 → "0:42", 3725 → "1:02:05". */
function formatClock(seconds: number): string {
    const s = Math.max(0, Math.round(seconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, "0");
    return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
    const { videoId } = await params;
    const post = await getVideoPost(videoId);
    if (!post) return fallbackShareMetadata(`/video/${videoId}`, "not found");

    // The thumbnail already carries the meaning, so the card is the compact
    // thumbnail-left shape (the YouTube treatment), not a generated image.
    //
    // Description is the caption when there is one. Without it the helper
    // would fall back to the site tagline, which says nothing about THIS
    // video — so it becomes "@creator · 0:42 · 1.2K views" instead. The
    // creator lookup is the same cache()d call the page body makes.
    const creator = post.content?.trim() ? null : await getCreator(post.userId);
    const byline = [
        creator?.username ? `@${creator.username}` : creator?.name,
        post.duration ? formatClock(post.duration) : null,
        `${compactCount(post.views)} views`,
    ]
        .filter(Boolean)
        .join(" · ");

    return shareMetadata({
        title: post.title ?? "Video",
        description: post.content?.trim() || byline,
        path: `/video/${videoId}`,
        image: post.thumbnailUrl ?? undefined,
        card: post.thumbnailUrl ? "summary" : "summary_large_image",
        type: "video.other",
    });
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
