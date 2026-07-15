"use client";

import { ShieldAlert, ShieldCheck, Edit, Trash } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowTurnBackwardIcon, PinIcon, PinOffIcon } from "@hugeicons/core-free-icons";
import { useCommunityReply } from "@/hooks/use-community-reply";
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { trpc } from "@/lib/trpc/client";

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
    pinned?: boolean;
    replyTo?: { userName: string | null; content: string; deleted: boolean } | null;
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

export function CommunityChatItem({
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
    pinned = false,
    replyTo = null,
}: Props) {
    const [isEditing, setIsEditing] = useState(false);
    const [editContent, setEditContent] = useState(content);

    const utils = trpc.useUtils();
    const updateMessage = trpc.community.updateMessage.useMutation({
        onSuccess: () => {
            setIsEditing(false);
            utils.community.getMessages.invalidate();
        },
    });
    const deleteMessage = trpc.community.deleteMessage.useMutation({
        onSuccess: () => utils.community.getMessages.invalidate(),
    });
    const setPinned = trpc.community.setMessagePinned.useMutation({
        onSuccess: () => utils.community.getMessages.invalidate(),
    });
    const setReplyTo = useCommunityReply((s) => s.setReplyTo);

    const isOwner = userId === currentUserId;
    const isAdmin = currentMemberRole === "ADMIN";
    const isMod = currentMemberRole === "MODERATOR";
    const canDelete = !deleted && (isAdmin || isMod || isOwner);
    const canEdit = !deleted && isOwner && !fileUrl;
    const canPin = !deleted && (isAdmin || isMod);

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

    return (
        <div className="relative group flex items-center hover:bg-white/[0.03] px-4 py-2 transition w-full">
            <div className="group flex gap-x-2 items-start w-full">
                <Avatar className="h-9 w-9 mt-0.5">
                    <AvatarImage src={userImage ?? undefined} alt={userName ?? ""} />
                    <AvatarFallback className="bg-zinc-700 text-flexwhite text-xs">
                        {(userName ?? "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                </Avatar>

                <div className="flex flex-col w-full">
                    {replyTo && (
                        <div className="mb-0.5 flex items-center gap-1.5 text-[12px] font-medium text-zinc-500">
                            <HugeiconsIcon icon={ArrowTurnBackwardIcon} className="size-3 shrink-0 scale-y-[-1]" strokeWidth={2} />
                            <span className="shrink-0 font-semibold text-zinc-400">{replyTo.userName ?? "Unknown"}</span>
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
                            <span className={cn("font-semibold text-sm", roleColorMap[memberRole] ?? "text-zinc-300")}>
                                {userName ?? "Unknown"}
                            </span>
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
                        </div>
                        <span className="text-xs text-zinc-500">
                            {timestamp}
                        </span>
                    </div>

                    {fileUrl && (
                        <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="relative aspect-square rounded-md mt-2 overflow-hidden border border-zinc-700 flex items-center bg-zinc-800 h-48 w-48"
                        >
                            <img src={fileUrl} alt={content} className="object-cover w-full h-full" />
                        </a>
                    )}

                    {!fileUrl && !isEditing && (
                        <p className={cn(
                            "text-sm text-flexwhite/90 mt-0.5 leading-relaxed",
                            deleted && "italic text-zinc-500 text-sm"
                        )}>
                            {content}
                            {isUpdated && !deleted && (
                                <span className="text-[10px] mx-2 text-zinc-500">(edited)</span>
                            )}
                        </p>
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
                </div>
            </div>

            {!deleted && (
                <div className="hidden group-hover:flex items-center gap-x-1 absolute p-1 -top-3 right-5 bg-black3 border border-flexwhite/15 rounded-lg shadow-lg">
                    <TooltipProvider delayDuration={50}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button onClick={() => setReplyTo({ id, userName: userName ?? "Unknown", content })} className="cursor-pointer">
                                    <HugeiconsIcon icon={ArrowTurnBackwardIcon} className="w-4 h-4 text-zinc-400 hover:text-zinc-300 transition scale-y-[-1]" strokeWidth={2} />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top"><p className="text-xs">Reply</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    {canPin && (
                        <TooltipProvider delayDuration={50}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() => setPinned.mutate({ serverId, messageId: id, pinned: !pinned })}
                                        disabled={setPinned.isPending}
                                        className="cursor-pointer disabled:opacity-50"
                                    >
                                        <HugeiconsIcon icon={pinned ? PinOffIcon : PinIcon} className="w-4 h-4 text-zinc-400 hover:text-zinc-300 transition" strokeWidth={2} />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top"><p className="text-xs">{pinned ? "Unpin" : "Pin"}</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}

                    {canEdit && (
                        <TooltipProvider delayDuration={50}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Edit
                                        onClick={() => setIsEditing(true)}
                                        className="cursor-pointer w-4 h-4 text-zinc-400 hover:text-zinc-300 transition"
                                    />
                                </TooltipTrigger>
                                <TooltipContent side="top"><p className="text-xs">Edit</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}

                    {canDelete && (
                        <TooltipProvider delayDuration={50}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Trash
                                        onClick={() => deleteMessage.mutate({ messageId: id, serverId })}
                                        className="cursor-pointer w-4 h-4 text-zinc-400 hover:text-zinc-300 transition"
                                    />
                                </TooltipTrigger>
                                <TooltipContent side="top"><p className="text-xs">Delete</p></TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            )}
        </div>
    );
}
