import { permanentRedirect } from "next/navigation";

// Nothing renders here any more — both of this route's old jobs moved:
//
//   /<user>/<postId> → /video/<postId>   (videos got their own route)
//   /<user>/live     → /<user>           (live is a state of the profile page)
//
// Kept as a redirect rather than deleted so links already in the wild — a
// shared video, someone's bookmark — still land somewhere. 308, because the
// move is permanent.

interface Params {
    slug: string;
    videoId: string;
}

export default async function LegacyWatchRedirect({ params }: { params: Promise<Params> }) {
    const { slug, videoId } = await params;

    if (videoId === "live") permanentRedirect(`/${slug}`);
    permanentRedirect(`/video/${videoId}`);
}
