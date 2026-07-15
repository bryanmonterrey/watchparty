"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { SmileIcon } from "@hugeicons/core-free-icons";
import { EmojiPicker } from "@/components/messages/emoji-picker";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

export type MessageReaction = { emoji: string; count: number; reactedByMe: boolean };

// Reaction chips under a message (the Discord anatomy): count chips toggle on
// click, your own reactions get the highlighted ring, and a quiet add-reaction
// button opens the emoji picker. Renders nothing when there are no reactions
// (the hover toolbar owns the first-reaction entry point).
export function CommunityMessageReactions({
    messageId,
    reactions,
    showAddButton = true,
}: {
    messageId: string;
    reactions: MessageReaction[];
    showAddButton?: boolean;
}) {
    const utils = trpc.useUtils();
    const toggle = trpc.community.toggleReaction.useMutation({
        onSuccess: () => utils.community.getMessages.invalidate(),
    });

    if (!reactions.length) return null;

    return (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {reactions.map((r) => (
                <button
                    key={r.emoji}
                    onClick={() => toggle.mutate({ messageId, emoji: r.emoji })}
                    disabled={toggle.isPending}
                    className={cn(
                        "flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[12px] font-bold tabular-nums transition-colors",
                        r.reactedByMe
                            ? "bg-twitter/15 text-twitter ring-1 ring-inset ring-twitter/40"
                            : "bg-white/[0.06] text-zinc-300 hover:bg-white/10",
                    )}
                >
                    <span className="text-[14px] leading-none">{r.emoji}</span>
                    {r.count}
                </button>
            ))}
            {showAddButton && (
                <EmojiPicker onEmojiSelect={(e) => toggle.mutate({ messageId, emoji: e.native })}>
                    <button
                        aria-label="Add reaction"
                        className="grid size-7 cursor-pointer place-items-center rounded-full bg-white/[0.04] text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <HugeiconsIcon icon={SmileIcon} className="size-4" strokeWidth={2} />
                    </button>
                </EmojiPicker>
            )}
        </div>
    );
}
