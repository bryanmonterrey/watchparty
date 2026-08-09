"use client";

import { ShieldAlert, ShieldCheck } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowTurnBackwardIcon, PinIcon } from "@hugeicons/core-free-icons";
import { useCommunityReply } from "@/hooks/use-community-reply";
import { CommunityLinkEmbed, extractFirstUrl } from "./community-link-embed";
import { CommunityMessageReactions, type MessageReaction } from "./community-message-reactions";

// Render @mentions as chips, URLs as links, and :name: custom emoji inline;
// plain text otherwise.
function MessageContent({
    content,
    deleted,
    isUpdated,
    emojiMap,
}: {
    content: string;
    deleted: boolean;
    isUpdated: boolean;
    emojiMap?: Record<string, string>;
}) {
    const parts = content.split(/(@[a-zA-Z0-9_-]+|@everyone|https?:\/\/[^\s]+|:[a-z0-9_]{2,32}:)/g);
    return (
        <p className={cn(
            "text-sm text-flexwhite/90 mt-0.5 leading-relaxed break-words",
            deleted && "italic text-zinc-500 text-sm"
        )}>
            {parts.map((part, i) => {
                if (deleted) return <span key={i}>{part}</span>;
                if (/^@([a-zA-Z0-9_-]+|everyone)$/.test(part)) {
                    return <span key={i} className="rounded-[4px] bg-twitter/20 px-1 py-0.5 font-semibold text-twitter2">{part}</span>;
                }
                if (/^https?:\/\//.test(part)) {
                    return (
                        <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="break-all text-twitter2 hover:underline">
                            {part}
                        </a>
                    );
                }
                if (/^:[a-z0-9_]{2,32}:$/.test(part)) {
                    const url = emojiMap?.[part.slice(1, -1)];
                    if (url) {
                        // eslint-disable-next-line @next/next/no-img-element
                        return <img key={i} src={url} alt={part} title={part} className="inline-block size-5 object-contain align-text-bottom" />;
                    }
                }
                return <span key={i}>{part}</span>;
            })}
            {isUpdated && !deleted && (
                <span className="text-[10px] mx-2 text-zinc-500">(edited)</span>
            )}
        </p>
    );
}
import { memo, useState, useEffect } from "react";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc/client";
import { chatItemPropsEqual } from "./community-chat-item-equality";
import { useCommunityReaction } from "@/hooks/use-community-reaction";
import { useMessagePatch } from "@/hooks/use-message-patch";
import { DELETED_MESSAGE_TEXT } from "@/lib/community/constants";
import { MessageActions } from "@/components/messages/message-actions";

type Props = {
    id: string;
    content: string;
    memberRole: string;
    userName: string | null;
    userImage: string | null;
    userId: string;
    currentUserId: string;
    currentMemberRole: string;
    timestamp: string;
    fileUrl: string | null;
    deleted: boolean;
    isUpdated: boolean;
    serverId: string;
    /** Scopes cache updates + invalidation to this channel. */
    channelId: string;
    pinned?: boolean;
    replyTo?: { userName: string | null; content: string; deleted: boolean } | null;
    reactions?: MessageReaction[];
    currentUsername?: string | null;
    emojiMap?: Record<string, string>;
    /** join/boost announcements render as a compact system row */
    system?: boolean;
    /** custom-role name tint (hex) — wins over the tier color */
    roleColor?: string | null;
    /** server safety setting: image attachments blur until clicked */
    blurMedia?: boolean;
    /** posted by an incoming webhook — APP badge, no member affordances */
    isWebhook?: boolean;
};

const roleIconMap: Record<string, React.ReactNode> = {
    GUEST: null,
    MODERATOR: <ShieldCheck className="h-4 w-4 ml-1 text-twitter2" />,
    ADMIN: <ShieldAlert className="h-4 w-4 ml-1 text-twitter" />,
};

const roleColorMap: Record<string, string> = {
    ADMIN: "text-twitter",
    MODERATOR: "text-twitter2",
    GUEST: "text-flexwhite",
};

function CommunityChatItemImpl({
    id,
    content,
    memberRole,
    userName,
    userImage,
    userId,
    currentUserId,
    currentMemberRole,
    timestamp,
    fileUrl,
    deleted,
    isUpdated,
    serverId,
    channelId,
    pinned = false,
    replyTo = null,
    reactions = [],
    currentUsername = null,
    emojiMap,
    system = false,
    roleColor = null,
    blurMedia = false,
    isWebhook = false,
}: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(content);
    const [revealed, setRevealed] = useState(false);

    // Every message action patches the cached row first and reconciles after —
    // pin, edit and delete used to wait out a round trip plus a full refetch.
    const { snapshot, restore, patch, invalidate } = useMessagePatch(channelId);

    const updateMessage = trpc.community.updateMessage.useMutation({
        onMutate: ({ messageId, content: next }) => {
            const previous = snapshot();
            setIsEditing(false);
            patch(messageId, (m) => ({ ...m, content: next, updatedAt: new Date() }));
            return { previous };
        },
        onError: (_e, _v, ctx) => { restore(ctx?.previous); setIsEditing(true); },
        onSettled: invalidate,
    });
    const deleteMessage = trpc.community.deleteMessage.useMutation({
        onMutate: ({ messageId }) => {
            const previous = snapshot();
            // Mirror the server's write EXACTLY — deleted + tombstone text +
            // no file. Setting only `deleted` left the original text on screen
            // in italics until the refetch swapped it, so the row changed twice
            // (measured: the second change landed 1.7s later).
            patch(messageId, (m) => ({
                ...m,
                deleted: true,
                content: DELETED_MESSAGE_TEXT,
                fileUrl: null,
            }));
            return { previous };
        },
        onError: (_e, _v, ctx) => restore(ctx?.previous),
        onSettled: invalidate,
    });
    const setPinned = trpc.community.setMessagePinned.useMutation({
        onMutate: ({ messageId, pinned: next }) => {
            const previous = snapshot();
            patch(messageId, (m) => ({ ...m, pinned: next }));
            return { previous };
        },
        onError: (_e, _v, ctx) => restore(ctx?.previous),
        onSettled: invalidate,
    });
    const toggleReaction = useCommunityReaction(channelId);
    const setReplyTo = useCommunityReply((s) => s.setReplyTo);

    const isOwner = userId === currentUserId;
    const isAdmin = currentMemberRole === "ADMIN";
    const isMod = currentMemberRole === "MODERATOR";
    const canDelete = !deleted && (isAdmin || isMod || isOwner);
    const canEdit = !deleted && isOwner && !fileUrl;
    const canPin = !deleted && (isAdmin || isMod);
    const embedUrl = extractFirstUrl(content);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsEditing(false);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, []);

    const onSubmitEdit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editContent.trim()) return;
        updateMessage.mutate({ messageId: id, content: editContent });
    };

    // System rows (joins, boosts): one quiet line, no avatar, no toolbar.
    if (system) {
        return (
            <div data-message-id={id} className="flex items-center gap-2.5 px-4 py-1.5">
                <span aria-hidden className="ml-1 inline-block size-2 shrink-0 rounded-full bg-lantern/70" />
                <p className="min-w-0 truncate text-[13px] font-medium text-zinc-500">
                    {content}
                    <span className="ml-2 text-[11px] text-zinc-600">{timestamp}</span>
                </p>
            </div>
        );
    }

    return (
        <div data-message-id={id} className={cn(
            "relative group flex items-center px-4 py-2 transition w-full",
            !deleted && currentUsername && (content.includes(`@${currentUsername}`) || content.includes("@everyone"))
                ? "bg-sunset/[0.07] shadow-[inset_2px_0_0_var(--color-sunset)] hover:bg-sunset/10"
                : "hover:bg-white/[0.03]",
        )}>
            <div className="group flex gap-x-2 items-start w-full">
                <Avatar className="h-9 w-9 mt-0.5">
                    <AvatarImage src={userImage ?? undefined} alt={userName ?? ""} />
                    <AvatarFallback className="bg-zinc-700 text-flexwhite text-xs">
                    </AvatarFallback>
                </Avatar>

                <div className="flex flex-col w-full">
                    {replyTo && (
                        <div className="mb-0.5 flex items-center gap-1.5 text-[12px] font-medium text-zinc-500">
                            <HugeiconsIcon icon={ArrowTurnBackwardIcon} className="size-3 shrink-0 scale-y-[-1]" strokeWidth={2} />
                            <span className="shrink-0 font-semibold text-zinc-400">{replyTo.userName ?? ""}</span>
                            <span className="truncate">{replyTo.deleted ? "message deleted" : replyTo.content}</span>
                        </div>
                    )}
                    {pinned && !deleted && (
                        <div className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-zinc-500">
                            <HugeiconsIcon icon={PinIcon} className="size-3" strokeWidth={2} /> Pinned
                        </div>
                    )}
                    <div className="flex items-center gap-x-2">
                        <div className="flex items-center">
                            <span
                                className={cn("font-semibold text-sm", roleColorMap[memberRole] ?? "text-zinc-300")}
                                style={roleColor ? { color: roleColor } : undefined}
                            >
                                {userName ?? ""}
                            </span>
                            {isWebhook ? (
                                <span className="ml-1.5 rounded-md bg-twitter/15 px-1.5 py-px text-[10px] font-bold tracking-wide text-twitter">
                                    APP
                                </span>
                            ) : (
                                <TooltipProvider delayDuration={50}>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span>{roleIconMap[memberRole]}</span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                            <p className="text-xs capitalize">{memberRole.toLowerCase()}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            )}
                        </div>
                        <span className="text-xs text-zinc-500">
                            {timestamp}
                        </span>
                    </div>

                    {fileUrl && (blurMedia && !revealed ? (
                        // Blur media (server safety setting): hidden until clicked
                        <button
                            onClick={() => setRevealed(true)}
                            className="relative aspect-square rounded-md mt-2 overflow-hidden border border-zinc-700 flex items-center bg-zinc-800 h-48 w-48 cursor-pointer"
                        >
                            <img src={fileUrl} alt="" aria-hidden className="object-cover w-full h-full blur-2xl scale-110" />
                            <span className="absolute inset-0 grid place-items-center">
                                <span className="rounded-full bg-black/60 px-3 py-1.5 text-[12px] font-bold text-white">
                                    Click to reveal
                                </span>
                            </span>
                        </button>
                    ) : (
                        <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="relative aspect-square rounded-md mt-2 overflow-hidden border border-zinc-700 flex items-center bg-zinc-800 h-48 w-48"
                        >
                            <img src={fileUrl} alt={content} className="object-cover w-full h-full" />
                        </a>
                    ))}

                    {!fileUrl && !isEditing && (
                        <>
                            <MessageContent content={content} deleted={deleted} isUpdated={isUpdated} emojiMap={emojiMap} />
                            {!deleted && embedUrl && <CommunityLinkEmbed url={embedUrl} />}
                        </>
                    )}

                    {!fileUrl && isEditing && (
                        <form onSubmit={onSubmitEdit} className="flex items-center w-full gap-x-2 pt-2">
                            <input
                                autoFocus
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                disabled={updateMessage.isPending}
                                className="flex-1 px-3 py-2 bg-zinc-800/50 border border-flexwhite/10 rounded-xl text-sm text-flexwhite outline-none focus-within:ring-1 focus:ring-white/20"
                                placeholder="Edited message"
                            />
                            <button
                                type="submit"
                                disabled={updateMessage.isPending}
                                className="px-3 py-1.5 bg-twitter hover:bg-twitter2 text-black font-semibold text-sm rounded-full transition disabled:opacity-50"
                            >
                                Save
                            </button>
                        </form>
                    )}
                    {isEditing && (
                        <span className="text-[10px] mt-1 text-zinc-500">
                            Press escape to cancel, enter to save
                        </span>
                    )}

                    {!deleted && (
                        <CommunityMessageReactions channelId={channelId} messageId={id} reactions={reactions} />
                    )}
                </div>
            </div>

            {!deleted && (
                <TooltipProvider delayDuration={50}>
                    <MessageActions
                        reactionScope={serverId}
                        isPinned={pinned}
                        pinPending={setPinned.isPending}
                        onDelete={canDelete ? () => deleteMessage.mutate({ messageId: id, serverId }) : undefined}
                        onEdit={canEdit ? () => setIsEditing(true) : undefined}
                        onReact={(emoji) => toggleReaction.mutate({ messageId: id, emoji })}
                        onReply={() => setReplyTo({ id, userName: userName ?? "", content })}
                        onTogglePin={canPin ? () => setPinned.mutate({ serverId, messageId: id, pinned: !pinned }) : undefined}
                    />
                </TooltipProvider>
            )}
        </div>
    );
}

/**
 * Memoized: a channel subscription invalidates `getMessages` on every incoming
 * message, so without this every row in the channel re-renders whenever anyone
 * says anything. See `community-chat-item-equality.ts` for why the comparator
 * is custom.
 */
export const CommunityChatItem = memo(CommunityChatItemImpl, chatItemPropsEqual);
