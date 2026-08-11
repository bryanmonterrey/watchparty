"use client";

import { trpc } from "@/lib/trpc/client";
import { PostCard } from "./post-card";
import { PollProvider } from "./poll-context";
import { PostCardSkeleton } from "./post-card-skeleton";
import { BookmarkIcon } from "@/components/icons";
import { useAuthSession } from "@/hooks/use-auth-session";
import { bookmarksSnapshotStore } from "@/lib/snapshot/surfaces";
import { privateViewerKey } from "@/lib/snapshot/keys";
import { useSnapshot } from "@/hooks/use-snapshot";

export function BookmarksFeed() {
    // The safest surface in the app to paint from a snapshot: the list is yours,
    // it only changes when you change it, and you arrive here on purpose — so a
    // week-old page is almost always still exactly right.
    const { data: session } = useAuthSession();
    const snapshotKey = privateViewerKey(session?.user?.id, "bookmarks");

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isPlaceholderData } =
        trpc.content.getBookmarks.useInfiniteQuery(
            { limit: 20 },
            {
                getNextPageParam: (last) => last.nextCursor,
                // Gated on the session, and that is what makes the snapshot
                // work rather than merely being tidy.
                //
                // `placeholderData` is only consulted while the query is
                // PENDING (query-core: `data === undefined && status ===
                // "pending"`). `useAuthSession` is itself a network call, so
                // without this gate render one evaluates the placeholder with
                // an empty key — privateViewerKey has no viewer yet — and if
                // the data lands before the session does, the query settles to
                // "success" and the snapshot is never consulted again. A race,
                // usually lost on a fast connection.
                //
                // A disabled query is still "pending", so waiting costs nothing
                // and is correct on its own terms: this is a protected
                // procedure that would 401 without a session anyway.
                enabled: !!session?.user?.id,
                placeholderData: () => bookmarksSnapshotStore.read(snapshotKey),
            }
        );

    useSnapshot(bookmarksSnapshotStore, snapshotKey, data, isPlaceholderData);

    const posts = data?.pages.flatMap(p => p.posts) ?? [];

    return (
        <div className="flex flex-col">
            {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => <PostCardSkeleton key={i} withMedia={i % 2 === 1} />)
            ) : posts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-8">
                    <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center">
                        <BookmarkIcon className="w-6 h-6 text-zinc-500" />
                    </div>
                    <p className="text-zinc-400 font-semibold">No bookmarks yet</p>
                    <p className="text-zinc-500 text-sm">Posts you bookmark will appear here.</p>
                </div>
            ) : (
                <PollProvider postIds={posts.map(p => p.id)}>
                    {posts.map((post, idx) => (
                        <PostCard
                            key={post.id}
                            post={post as any}
                            index={idx % 20}
                            initialLiked={(post as any).isLiked ?? false}
                            initialBookmarked
                            initialReposted={(post as any).isReposted ?? false}
                        />
                    ))}
                    {hasNextPage && (
                        <div className="py-10 flex justify-center border-t border-flexwhite/15">
                            <button
                                onClick={() => fetchNextPage()}
                                disabled={isFetchingNextPage}
                                className="text-bleu hover:underline disabled:text-zinc-500"
                            >
                                {isFetchingNextPage ? "Loading more…" : "Load more"}
                            </button>
                        </div>
                    )}
                </PollProvider>
            )}
        </div>
    );
}

