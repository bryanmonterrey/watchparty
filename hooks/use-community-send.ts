"use client";

import { trpc } from "@/lib/trpc/client";
import { COMMUNITY_PAGE_LIMIT } from "@/hooks/use-community-reaction";

/**
 * Send a community message and show it **immediately**.
 *
 * Before this, a send waited for the mutation round trip and then an
 * `invalidate` + refetch before your own message appeared — the same shape as
 * the reaction lag, and the same fix.
 *
 * ## The `localKey` idea, and how far this goes toward it
 *
 * Buzz gives every optimistic message a client-generated `localKey` and, when
 * the real event arrives, **the confirmed message inherits that key**
 * (`reconcileIncomingMessage` in `features/messages/lib/messageMerge.ts`, which
 * matches on content + kind + author + channel + thread refs). Rows key off
 * `localKey ?? id`, so the React key never changes as a message goes
 * optimistic → confirmed: no unmount, no remount, no flicker, no scroll jump.
 * The message simply stops being pending.
 *
 * We can't inherit the key yet — the server generates the id and doesn't echo a
 * client-supplied one back, so there is nothing to match on the way in. The
 * optimistic row is therefore replaced wholesale when the refetch lands, which
 * costs one remount of a single row.
 *
 * That is a much smaller cost than the seconds of nothing it replaces, and the
 * proper fix is a server change: accept a `clientKey` on send, return it on the
 * message, and key rows off `clientKey ?? id`.
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
    const input = { channelId, limit: COMMUNITY_PAGE_LIMIT };

    return trpc.community.sendMessage.useMutation({
        onMutate: async (vars) => {
            if (!author) return;
            await utils.community.getMessages.cancel(input);
            const previous = utils.community.getMessages.getInfiniteData(input);

            utils.community.getMessages.setInfiniteData(input, (old) => {
                if (!old?.pages?.length) return old;
                const now = new Date();
                const optimistic = {
                    id: `optimistic-${now.getTime()}`,
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
                };
                // Page 0 is the newest page and the list renders reversed, so
                // the newest message is the FIRST item of the FIRST page.
                const [first, ...rest] = old.pages;
                return {
                    ...old,
                    pages: [{ ...first, items: [optimistic, ...first.items] }, ...rest],
                };
            });

            return { previous };
        },
        onError: (_err, _vars, context) => {
            if (context?.previous) {
                utils.community.getMessages.setInfiniteData(input, context.previous);
            }
        },
        onSettled: () => {
            utils.community.getMessages.invalidate({ channelId });
        },
    });
}
