"use client";

import { trpc } from "@/lib/trpc/client";
import { useQueryClient } from "@tanstack/react-query";

/** Just enough shape to patch pages; the rest of each item rides along. */
type InfiniteMessages = { pages: { items: Record<string, unknown>[] }[]; pageParams: unknown[] };
import { COMMUNITY_PAGE_LIMIT } from "@/hooks/use-community-reaction";
import { forgetLocalKey, registerLocalKey } from "@/lib/community/local-keys";

/**
 * Send a community message and show it **immediately**.
 *
 * Before this, a send waited for the mutation round trip and then an
 * `invalidate` + refetch before your own message appeared — the same shape as
 * the reaction lag, and the same fix.
 *
 * The row also keeps a STABLE REACT KEY across optimistic → confirmed, via
 * `lib/community/local-keys.ts`. Without that, the invented id disappears and a
 * real one appears, so React unmounts one row and mounts another: the message
 * flickers, in-row state is destroyed, and a measured row is replaced by an
 * unmeasured one. With it, the row is updated in place — it just stops being
 * pending. That is buzz's `localKey`, and like buzz it needs no server change,
 * because the match is a client-side heuristic on the message's own content.
 */

type OptimisticAuthor = {
    userId: string;
    userName: string;
    userImage: string | null;
    memberRole: string;
    roleColor?: string | null;
};

export function useCommunitySend(channelId: string, author: OptimisticAuthor | null) {
    const utils = trpc.useUtils();
    const qc = useQueryClient();
    const input = { channelId, limit: COMMUNITY_PAGE_LIMIT };

    return trpc.community.sendMessage.useMutation({
        onMutate: async (vars) => {
            if (!author) return;
            await utils.community.getMessages.cancel(input);
            const previous = utils.community.getMessages.getInfiniteData(input);

            const localKey = registerLocalKey({
                channelId,
                userId: author.userId,
                content: vars.content,
                replyToId: vars.replyToId ?? null,
            });

            // Predicate match rather than exact-key match.
            //
            // tRPC's setInfiniteData needs the input to hash identically to the
            // query's. That is a silent no-op when it doesn't, and debugging it
            // costs more than it saves: matching on "this procedure, this
            // channel" is both easier to read and immune to a key shape
            // changing under us.
            qc.setQueriesData<InfiniteMessages>(
                {
                    predicate: (q) => {
                        const [path, meta] = q.queryKey as [string[], { input?: { channelId?: string }; type?: string }];
                        return (
                            Array.isArray(path) &&
                            path[0] === "community" &&
                            path[1] === "getMessages" &&
                            meta?.type === "infinite" &&
                            meta?.input?.channelId === channelId
                        );
                    },
                },
                (old) => {
                if (!old?.pages?.length) return old;
                const now = new Date();
                const optimistic = {
                    // The local key IS the id, so the optimistic row and its
                    // confirmed copy resolve to the same render key.
                    id: localKey,
                    content: vars.content,
                    fileUrl: vars.fileUrl ?? null,
                    deleted: false,
                    pinned: false,
                    system: false,
                    replyToId: vars.replyToId ?? null,
                    createdAt: now,
                    updatedAt: now,
                    memberId: null,
                    channelId,
                    memberRole: author.memberRole,
                    userId: author.userId,
                    userName: author.userName,
                    userImage: author.userImage,
                    userUsername: null,
                    isWebhook: false,
                    replyContent: null,
                    replyDeleted: null,
                    replyUserName: null,
                    reactions: [],
                    roleColor: author.roleColor ?? null,
                    pending: true,
                };
                // Page 0 is the newest page and the list renders reversed, so
                // the newest message is the FIRST item of the FIRST page.
                const [first, ...rest] = old.pages;
                return {
                    ...old,
                    pages: [{ ...first, items: [optimistic, ...first.items] }, ...rest],
                };
            },
            );

            return { previous };
        },
        onError: (_err, vars, context) => {
            if (author) {
                forgetLocalKey({
                    channelId,
                    userId: author.userId,
                    content: vars.content,
                    replyToId: vars.replyToId ?? null,
                });
            }
            if (context?.previous) {
                utils.community.getMessages.setInfiniteData(input, context.previous);
            }
        },
        onSettled: () => {
            utils.community.getMessages.invalidate({ channelId });
        },
    });
}
