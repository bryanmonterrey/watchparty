"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PauseIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { useStreamChat, type StreamChatMessage } from "@/hooks/use-stream-chat";
import { useChatPrefs } from "@/hooks/use-chat-prefs";
import { emoteSet } from "@/lib/chat/emotes";
import { ChatLine } from "./chat-line";
import { ChatComposer } from "./chat-composer";
import { ChatSettings } from "./chat-settings";
import { ChatMembers } from "./chat-members";
import { ChatPinned } from "./chat-pinned";
import { ChatGifterMarquee } from "./chat-gifter-marquee";
import { ChatLeaderboard } from "./chat-leaderboard";
import { useAuthSession } from "@/hooks/use-auth-session";
import { toast } from "sonner";

// The chat itself: the message list, the composer, and the settings overlay.
//
// Split out of stream-chat.tsx so the pop-out window (app/(popout)/popout/chat)
// is the SAME component as the rail's Chat tab rather than a second copy that
// drifts. stream-chat owns the rail's tabs and card; this owns chat.

/**
 * How close to the bottom still counts as "following along".
 *
 * Not zero: a wrapped line or a just-decoded emote changes scrollHeight by a few
 * pixels, and an exact comparison would drop out of follow mode on its own and
 * strand the reader mid-conversation.
 */
const FOLLOW_SLACK_PX = 48;

/** A creator's emote set changes about never, and every viewer asks for the same one. */
const EMOTE_STALE_MS = 5 * 60 * 1000;

export function ChatPanel({
    hostUserId,
    enabled = true,
}: {
    hostUserId: string;
    enabled?: boolean;
}) {
    const [replyTo, setReplyTo] = useState<StreamChatMessage | null>(null);
    // Whether new messages pull the view down. Scrolling up turns this off so
    // reading back doesn't fight the stream; the pill turns it back on.
    const [following, setFollowing] = useState(true);
    // null = closed. The value is which screen to open on, so the shield can go
    // straight to Identity while the gear starts at the menu.
    const [settings, setSettings] = useState<"menu" | "identity" | null>(null);
    const [membersOpen, setMembersOpen] = useState(false);
    const [boardOpen, setBoardOpen] = useState(false);
    const scrollerRef = useRef<HTMLDivElement>(null);
    const { prefs, update: setPrefs } = useChatPrefs();

    const { messages, send, connected, members, requestMembers, pinned } = useStreamChat(hostUserId, enabled);

    // Whether the viewer can pin. Same procedure the roster ranks with, asked
    // about one id — it shares a cache shape with that query rather than needing
    // a second endpoint answering the same question.
    const { data: session } = useAuthSession();
    const myId = session?.user?.id;
    const { data: myRole } = trpc.stream.chatRoles.useQuery(
        { creatorId: hostUserId, userIds: myId ? [myId] : [] },
        { enabled: !!myId, staleTime: 5 * 60_000 },
    );
    const canModerate = !!myId && (myRole?.[myId] === "host" || myRole?.[myId] === "moderator");

    const pin = trpc.stream.pinChatMessage.useMutation({
        onError: (e) => toast.error(e.message),
    });

    // The channel's own emotes, merged over the global set.
    const { data: custom } = trpc.creator.getEmotes.useQuery(
        { creatorId: hostUserId },
        { enabled: !!hostUserId, staleTime: EMOTE_STALE_MS },
    );
    const emotes = useMemo(() => emoteSet(custom), [custom]);

    useEffect(() => {
        const el = scrollerRef.current;
        if (!el || !following) return;
        el.scrollTop = el.scrollHeight;
    }, [messages, following]);

    const onScroll = useCallback(() => {
        const el = scrollerRef.current;
        if (!el) return;
        setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_SLACK_PX);
    }, []);

    const resume = useCallback(() => {
        const el = scrollerRef.current;
        setFollowing(true);
        if (el) el.scrollTop = el.scrollHeight;
    }, []);

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <ChatGifterMarquee hostUserId={hostUserId} onOpen={() => setBoardOpen(true)} />

            {/* The MESSAGE region, and the positioning context for the menus.
                They anchor to the bottom of this — not of the whole panel — so
                the emote strip, the input and the send row below always stay in
                view and usable with a menu open.

                An anchor rather than padding the menus out by the composer's
                height: that height isn't fixed (the reply banner comes and goes),
                so any hard-coded offset would be wrong half the time. */}
            <div className="relative flex min-h-0 flex-1 flex-col">
                <div
                    ref={scrollerRef}
                    onScroll={onScroll}
                    className="hidden-scrollbar min-h-0 flex-1 overflow-y-auto"
                >
                    {messages.length === 0 && (
                        <p className="pt-8 text-center text-xs font-medium text-zinc-500">
                            {connected ? "Say something" : "Connecting to chat…"}
                        </p>
                    )}
                    {messages.map((m, i) => (
                        <ChatLine
                            key={`${m.id}-${i}`}
                            message={m}
                            emotes={emotes}
                            prefs={prefs}
                            onReply={setReplyTo}
                            onPin={canModerate
                                ? (msg) => pin.mutate({ creatorId: hostUserId, messageId: msg.id })
                                : undefined}
                        />
                    ))}
                </div>

                {pinned && (
                    <ChatPinned
                        pin={pinned}
                        hostUserId={hostUserId}
                        canModerate={canModerate}
                        emotes={emotes}
                    />
                )}

                {!following && (
                    // Floats over the last lines rather than sitting above the
                    // composer, so resuming doesn't reflow the panel under the cursor.
                    <button
                        type="button"
                        onClick={resume}
                        className="absolute inset-x-0 bottom-2 mx-auto flex w-fit cursor-pointer items-center gap-1.5 rounded-full bg-soft-gray-20 px-3 py-1.5 text-xs font-bold text-flexwhite transition-colors hover:bg-soft-gray-15"
                    >
                        <HugeiconsIcon icon={PauseIcon} className="size-3.5" strokeWidth={2.5} />
                        Chat paused for scrolling
                    </button>
                )}

                {membersOpen && (
                    <ChatMembers
                        hostUserId={hostUserId}
                        members={members}
                        onRequest={requestMembers}
                        onClose={() => setMembersOpen(false)}
                    />
                )}

                {boardOpen && (
                    <ChatLeaderboard hostUserId={hostUserId} onClose={() => setBoardOpen(false)} />
                )}

                {settings && (
                    <ChatSettings
                        hostUserId={hostUserId}
                        initialScreen={settings}
                        prefs={prefs}
                        onPrefs={setPrefs}
                        onClose={() => setSettings(null)}
                    />
                )}
            </div>

            <ChatComposer
                onSend={send}
                connected={connected}
                emotes={emotes}
                replyTo={replyTo}
                onCancelReply={() => setReplyTo(null)}
                onOpenIdentity={() => setSettings("identity")}
                onOpenSettings={() => setSettings("menu")}
                onOpenMembers={() => setMembersOpen(true)}
            />
        </div>
    );
}
