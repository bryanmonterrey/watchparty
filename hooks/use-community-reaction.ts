"use client";

import { trpc } from "@/lib/trpc/client";
import type { MessageReaction } from "@/components/community/community-message-reactions";

/**
 * Toggle a reaction and show it **immediately**.
 *
 * Before this, both toggle sites did `getMessages.invalidate()` with no input
 * and no optimistic update. That meant: wait for the mutation round trip, then
 * invalidate EVERY `getMessages` query in the cache, then refetch EVERY PAGE of
 * an infinite query — each page being three sequential DB round trips
 * (messages → reactions → role colours). Your own emoji took ~10 seconds to
 * appear.
 *
 * Now the chip is painted from the cache before the request leaves, and the
 * refetch is scoped to the one channel.
 *
 * The cache input must match the query's EXACTLY — `{ channelId, limit }` —
 * or `setInfiniteData` addresses a different entry and silently no-ops. That is
 * the same failure that made DM optimistic sends invisible; hence
 * `COMMUNITY_PAGE_LIMIT` being shared rather than retyped.
 */

/** Page size for `community.getMessages`. Part of the query KEY — see above. */
export const COMMUNITY_PAGE_LIMIT = 50;

/** Apply a toggle to one message's reaction list. */
export function toggleReactionInList(
    reactions: MessageReaction[],
    emoji: string,
): MessageReaction[] {
    const existing = reactions.find((r) => r.emoji === emoji);
    if (!existing) return [...reactions, { emoji, count: 1, reactedByMe: true }];

    if (existing.reactedByMe) {
        // Removing my own. The chip disappears when I was the only one.
        if (existing.count <= 1) return reactions.filter((r) => r.emoji !== emoji);
        return reactions.map((r) =>
            r.emoji === emoji ? { ...r, count: r.count - 1, reactedByMe: false } : r,
        );
    }
    return reactions.map((r) =>
        r.emoji === emoji ? { ...r, count: r.count + 1, reactedByMe: true } : r,
    );
}

export function useCommunityReaction(channelId: string | null) {
    const utils = trpc.useUtils();
    const input = { channelId: channelId ?? "", limit: COMMUNITY_PAGE_LIMIT };

    return trpc.community.toggleReaction.useMutation({
        onMutate: async ({ messageId, emoji }) => {
            if (!channelId) return;
            // Stop an in-flight refetch from landing on top of the patch.
            await utils.community.getMessages.cancel(input);
            const previous = utils.community.getMessages.getInfiniteData(input);

            utils.community.getMessages.setInfiniteData(input, (old) => {
                if (!old) return old;
                return {
                    ...old,
                    // No annotation on `page` — typing it as a narrow local
                    // shape makes the UPDATER's return type that narrow shape,
                    // and tRPC then rejects it for missing the page's other
                    // fields. Inference keeps the real type.
                    pages: old.pages.map((page) => ({
                        ...page,
                        items: page.items.map((m) =>
                            m.id === messageId
                                ? { ...m, reactions: toggleReactionInList(m.reactions ?? [], emoji) }
                                : m,
                        ),
                    })),
                };
            });

            return { previous };
        },
        onError: (_err, _vars, context) => {
            // Put the server's version back rather than guessing the inverse —
            // someone else's reaction may have landed in between.
            if (context?.previous) {
                utils.community.getMessages.setInfiniteData(input, context.previous);
            }
        },
        onSettled: () => {
            if (!channelId) return;
            // Scoped: the old unscoped invalidate refetched every channel's
            // every page.
            utils.community.getMessages.invalidate({ channelId });
        },
    });
}
