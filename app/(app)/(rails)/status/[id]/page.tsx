import { PostDetailView } from "@/components/browse/post-view";
import { db } from "@/db";
import { posts, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";

// Port of sidebar's (browse)/discover/post/[id]/page.tsx.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const { id } = await params;
    try {
        const result = await db
            .select({
                content: posts.content,
                name: user.name,
                username: user.username,
            })
            .from(posts)
            .innerJoin(user, eq(posts.userId, user.id))
            .where(eq(posts.id, id))
            .limit(1);

        const post = result[0];
        if (!post) return { title: "post not found" };

        return {
            // Name and @handle are identity and keep their case; the brand
            // is dropped because the root template appends "/ watchparty"
            // already, and this read "... on Watchparty / watchparty".
            title: `${post.name} (@${post.username})`,
            description: post.content?.slice(0, 160) || "Check out this post on Watchparty",
        };
    } catch (error) {
        console.error("Error in generateMetadata:", error);
        return { title: "post" };
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
