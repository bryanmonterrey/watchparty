"use client";

import { useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { LinkBackwardIcon, PinIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { MiniProfile } from "@/components/profile/mini-profile-card";
import { ChatIdentity } from "./chat-identity";
import { resolveChatNameColor } from "@/lib/chat/chat-name-color";
import { parseChatText, isEmoteOnly, type Emote } from "@/lib/chat/emotes";
import { CHAT_FONT_CLASS, type ChatPrefs } from "@/hooks/use-chat-prefs";
import type { StreamChatMessage } from "@/hooks/use-stream-chat";
import { cn } from "@/lib/utils";
import { Squircle } from "@/components/ui/squircle";

// One line of live chat.
//
// The anatomy is the reference's, not what this rail had before: no avatar
// column, badges where the avatar was, and the name coloured per-user. The
// avatar went because a 24px circle on every line costs more vertical room than
// it earns — in a 384px rail that swap is worth about five more visible lines,
// and identity is already carried by the colour and the badges.
//
// The whole line is ONE wrapping paragraph rather than a flex row: badges, name
// and text are inline, so a long message wraps back under the badges the way
// running text should, instead of forming a hanging indent against an avatar.

/**
 * Emotes sitting in a sentence match the text's rhythm — sized in `em` rather
 * than pixels so they track the reader's font-size choice instead of staying
 * put while the words around them grow.
 */
const EMOTE_INLINE = "inline-block h-[1.6em] w-[1.6em] translate-y-[-1px] align-middle";
/** A line that is ONLY emotes is a reaction, so it gets room to be one. */
const EMOTE_SOLO = "inline-block h-11 w-11 align-middle";

// Flipped vertically: LinkBackward's arrow curves UP out of the line, which
// reads as forwarding away from the conversation. Mirrored, it curves down
// into the message below it — the direction a reply actually goes.
export const REPLY_GLYPH = "-scale-y-100";

const CARD_STALE_MS = 5 * 60 * 1000;

export function ChatLine({
    message,
    emotes,
    prefs,
    onReply,
    onPin,
}: {
    message: StreamChatMessage;
    emotes: Map<string, Emote>;
    prefs: ChatPrefs;
    onReply?: (m: StreamChatMessage) => void;
    /** Moderators only — absent for everyone else, so the row has one action. */
    onPin?: (m: StreamChatMessage) => void;
}) {
    // Same cached query ChatIdentity reads — react-query dedupes per userId, so
    // the pair costs one request per unique chatter per 5 min, not two.
    const { data: card } = trpc.profile.card.useQuery(
        { userId: message.userId },
        { staleTime: CARD_STALE_MS, enabled: !!message.userId },
    );

    const tokens = useMemo(
        () => parseChatText(message.content, prefs.emotes ? emotes : new Map()),
        [message.content, emotes, prefs.emotes],
    );
    const solo = useMemo(() => isEmoteOnly(tokens), [tokens]);
    const nameColor = resolveChatNameColor(message.userId, card?.chatColor);

    return (
        <div className="group relative rounded-lg px-1.5 py-[3px] transition-colors hover:bg-white/[0.04]">
            {message.replyTo && (
                // The quote is what the DO resolved, not what the sender typed —
                // see ChatReply in the protocol.
                <p className="mb-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-zinc-500">
                    <HugeiconsIcon icon={LinkBackwardIcon} className={cn("size-3 shrink-0", REPLY_GLYPH)} strokeWidth={2} />
                    <span className="truncate">
                        Replying to {message.replyTo.name}: {message.replyTo.text}
                    </span>
                </p>
            )}

            <p className={cn("break-words leading-[1.45]", CHAT_FONT_CLASS[prefs.fontSize])}>
                {prefs.timestamps && (
                    <span className="mr-1.5 align-middle text-[11px] font-medium tabular-nums text-zinc-600">
                        {new Date(message.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </span>
                )}
                {prefs.badges && <ChatIdentity userId={message.userId} />}
                <MiniProfile userId={message.userId} triggerClassName="inline">
                    <span
                        className="cursor-pointer font-bold hover:underline"
                        style={{ color: nameColor }}
                    >
                        {/* The card's username wins over the DO's stamp. The
                            stamp is the username now too, but history replayed
                            from before that change carries display names, and
                            this card is already fetched for the colour. */}
                        {card?.username ?? message.sender}
                    </span>
                </MiniProfile>
                <span className="text-zinc-500">: </span>
                {tokens.map((t, i) => {
                    if (t.t === "emote") {
                        return (
                            <img
                                key={i}
                                src={t.src}
                                alt={`:${t.code}:`}
                                title={`:${t.code}:`}
                                draggable={false}
                                className={cn(solo ? EMOTE_SOLO : EMOTE_INLINE, "mx-[1px]")}
                            />
                        );
                    }
                    if (t.t === "mention") {
                        return (
                            <span key={i} className="font-semibold text-flexwhite">
                                {t.v}
                            </span>
                        );
                    }
                    if (t.t === "link") {
                        return (
                            <a
                                key={i}
                                href={t.v}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                                className="font-medium text-flexwhite underline underline-offset-2"
                            >
                                {t.v}
                            </a>
                        );
                    }
                    return (
                        <span key={i} className="text-zinc-100">
                            {t.v}
                        </span>
                    );
                })}
            </p>

            {/* Absolute so the actions cost the line no width — affordances that
                reflowed the text on hover would make the whole list twitch. */}
            <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                {onPin && (
                    <Squircle asChild radius={12}>
                        <button
                            type="button"
                            onClick={() => onPin(message)}
                            aria-label={`pin ${message.sender}'s message`}
                            title="Pin for everyone"
                            className="flex size-10 cursor-pointer items-center justify-center bg-soft-gray-15 text-zinc-400 transition-colors hover:text-white"
                        >
                            <HugeiconsIcon icon={PinIcon} className="size-5" strokeWidth={2} />
                        </button>
                    </Squircle>
                )}
                {onReply && (
                    <Squircle asChild radius={12}>
                        <button
                            type="button"
                            onClick={() => onReply(message)}
                            aria-label={`reply to ${message.sender}`}
                            className="flex size-10 cursor-pointer items-center justify-center bg-soft-gray-15 text-zinc-400 transition-colors hover:text-white"
                        >
                            <HugeiconsIcon icon={LinkBackwardIcon} className={cn("size-5", REPLY_GLYPH)} strokeWidth={2} />
                        </button>
                    </Squircle>
                )}
            </div>
        </div>
    );
}
