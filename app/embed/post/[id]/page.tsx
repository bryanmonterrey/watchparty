import { Metadata } from "next";
import { db } from "@/db";
import { posts } from "@/db/schema/content";
import { user } from "@/db/schema/auth";
import { and, eq } from "drizzle-orm";

// Public, iframe-embeddable post card (the "Embed post" menu action copies an
// iframe pointing here). Deliberately outside (app): no providers, no wallet,
// no query client — one server-rendered card, safe for third-party pages.
// /embed/* is a public prefix in routes.ts.

export const metadata: Metadata = { robots: { index: false } };

async function getEmbedPost(id: string) {
    const [row] = await db
        .select({
            id: posts.id,
            content: posts.content,
            imageUrl: posts.imageUrl,
            media: posts.media,
            createdAt: posts.createdAt,
            likes: posts.likes,
            comments: posts.comments,
            authorName: user.name,
            authorUsername: user.username,
            authorAvatar: user.avatar_url,
        })
        .from(posts)
        .innerJoin(user, eq(posts.userId, user.id))
        .where(and(
            eq(posts.id, id),
            eq(posts.status, "published"),
            eq(posts.visibility, "public"),
        ))
        .limit(1);
    return row ?? null;
}

export default async function EmbedPostPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const post = await getEmbedPost(id);

    if (!post) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a] p-6">
                <p className="text-sm font-semibold text-zinc-500">This post is unavailable.</p>
            </div>
        );
    }

    const image = post.imageUrl
        ?? (post.media ?? []).find((m) => m.type === "image")?.url
        ?? null;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://watchparty.xyz";
    const postUrl = `${appUrl}/feed/post/${post.id}`;
    const date = post.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    return (
        <div className="min-h-screen bg-[#0a0a0a] p-3">
            <a
                href={postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-[20px] bg-white/[0.03] p-5 ring-1 ring-white/10 transition-colors hover:bg-white/[0.05]"
            >
                <div className="flex items-center gap-3">
                    {post.authorAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.authorAvatar} alt="" className="size-10 rounded-full bg-zinc-800 object-cover" />
                    ) : (
                        <div className="size-10 rounded-full bg-zinc-800" />
                    )}
                    <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-white">{post.authorName}</p>
                        <p className="truncate text-xs font-semibold text-zinc-500">@{post.authorUsername}</p>
                    </div>
                    <span className="ml-auto shrink-0 text-xs font-bold text-zinc-500">watchparty</span>
                </div>
                {post.content && (
                    <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-100">
                        {post.content}
                    </p>
                )}
                {image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image} alt="" className="mt-3 max-h-[300px] w-full rounded-[14px] bg-zinc-900 object-cover" />
                )}
                <p className="mt-3 text-xs font-semibold text-zinc-500">
                    {post.likes.toLocaleString()} likes · {post.comments.toLocaleString()} replies · {date}
                </p>
            </a>
        </div>
    );
}
