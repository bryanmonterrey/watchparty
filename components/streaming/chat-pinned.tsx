"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, ArrowUp01Icon, Cancel01Icon, PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { Squircle } from "@/components/ui/squircle";
import { RAIL_BORDER } from "@/components/rails/rail-shell";
import { parseChatText, type Emote } from "@/lib/chat/emotes";
import { resolveChatNameColor } from "@/lib/chat/chat-name-color";
import type { PinnedMessage } from "@/lib/realtime/protocol";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// The channel's pinned message, floating over the top of the chat.
//
// Three states, and the middle one is the point: expanded, collapsed to one
// line, and dismissed to a button. Dismissing has to leave something behind —
// a pin is the host talking to the room, so a viewer who closes it needs a way
// back that doesn't involve reloading. That's the square button.
//
// Dismissal is per-viewer and local. Unpinning is a moderator action that
// clears it for everyone; those are different verbs and the UI shouldn't blur
// them, so the X-equivalent here only ever hides your own copy.

/** Reset dismissal when the pin CHANGES, not when it merely re-renders. */
function useDismissed(pinId: string | undefined) {
    const [dismissedId, setDismissedId] = useState<string | null>(null);
    useEffect(() => {
        setDismissedId(null);
    }, [pinId]);
    return {
        dismissed: !!pinId && dismissedId === pinId,
        dismiss: () => pinId && setDismissedId(pinId),
        restore: () => setDismissedId(null),
    };
}

export function ChatPinned({
    pin,
    hostUserId,
    canModerate,
    emotes,
}: {
    pin: PinnedMessage;
    hostUserId: string;
    canModerate: boolean;
    emotes: Map<string, Emote>;
}) {
    const [expanded, setExpanded] = useState(true);
    const { dismissed, dismiss, restore } = useDismissed(pin.id);

    const unpin = trpc.stream.pinChatMessage.useMutation({
        onError: (e) => toast.error(e.message),
    });

    if (dismissed) {
        return (
            <Squircle asChild radius={14}>
                <button
                    type="button"
                    onClick={restore}
                    aria-label="show pinned message"
                    title="Show pinned message"
                    className="absolute right-2 top-2 z-20 flex size-11 cursor-pointer items-center justify-center bg-soft-gray-20 text-zinc-300 transition-colors hover:text-white"
                >
                    <HugeiconsIcon icon={PinIcon} className="size-5" strokeWidth={2} />
                </button>
            </Squircle>
        );
    }

    const tokens = parseChatText(pin.text, emotes);

    return (
        <div className="absolute inset-x-1 top-1 z-20">
            <Squircle
                radius={16}
                autoEffects={false}
                innerBorder={RAIL_BORDER}
                className="flex flex-col bg-soft-gray-15 px-3 py-2"
            >
                <div className="flex items-center gap-1.5">
                    <HugeiconsIcon icon={PinIcon} className="size-3.5 shrink-0 text-zinc-400" strokeWidth={2.5} />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-400">
                        Sent by{" "}
                        <span className="font-bold" style={{ color: resolveChatNameColor(pin.userId) }}>
                            {pin.name}
                        </span>
                    </span>

                    {canModerate && (
                        <button
                            type="button"
                            disabled={unpin.isPending}
                            onClick={() => unpin.mutate({ creatorId: hostUserId, messageId: null })}
                            aria-label="unpin for everyone"
                            title="Unpin for everyone"
                            className="shrink-0 cursor-pointer text-zinc-500 transition-colors hover:text-white"
                        >
                            <HugeiconsIcon icon={PinOffIcon} className="size-4" strokeWidth={2} />
                        </button>
                    )}
                    {/* Hides YOUR copy. Distinct from unpin above, which clears
                        the room's — same corner, very different blast radius. */}
                    <button
                        type="button"
                        onClick={dismiss}
                        aria-label="hide pinned message"
                        title="Hide"
                        className="shrink-0 cursor-pointer text-zinc-500 transition-colors hover:text-white"
                    >
                        <HugeiconsIcon icon={Cancel01Icon} className="size-4" strokeWidth={2} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        aria-label={expanded ? "collapse" : "expand"}
                        aria-expanded={expanded}
                        className="shrink-0 cursor-pointer text-zinc-400 transition-colors hover:text-white"
                    >
                        <HugeiconsIcon
                            icon={expanded ? ArrowUp01Icon : ArrowDown01Icon}
                            className="size-4"
                            strokeWidth={2.5}
                        />
                    </button>
                </div>

                <p className={cn("break-words text-sm font-medium text-zinc-100", !expanded && "truncate")}>
                    {tokens.map((t, i) =>
                        t.t === "emote" ? (
                            <img
                                key={i}
                                src={t.src}
                                alt={`:${t.code}:`}
                                draggable={false}
                                className="mx-[1px] inline-block h-[1.6em] w-[1.6em] translate-y-[-1px] align-middle"
                            />
                        ) : t.t === "link" ? (
                            <a
                                key={i}
                                href={t.v}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                                className="text-flexwhite underline underline-offset-2"
                            >
                                {t.v}
                            </a>
                        ) : (
                            <span key={i}>{t.v}</span>
                        ),
                    )}
                </p>
            </Squircle>
        </div>
    );
}
