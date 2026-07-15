"use client";

import { Hash, Mic, Video, Edit, Trash, Lock } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useCommunityModal } from "@/hooks/use-community-modal";
import type { CommunityChannel, CommunityServer } from "@/db/schema/community";
import { LockIcon, TrashIcon } from "../icons";

type Props = {
    channel: CommunityChannel & { unreadCount?: number };
    server: CommunityServer;
    role?: string;
};

const iconMap = {
    TEXT: Hash,
    AUDIO: Mic,
    VIDEO: Video,
};

export function CommunityChannelItem({ channel, server, role }: Props) {
    const { onOpen } = useCommunityModal();
    const params = useParams();
    const router = useRouter();

    const Icon = iconMap[channel.type];
    const isActive = params?.channelId === channel.id;
    const hasUnread = !isActive && (channel.unreadCount ?? 0) > 0;

    const onClick = () => {
        router.push(`/communities/${params?.serverId}/channels/${channel.id}`);
    };

    const onAction = (e: React.MouseEvent, action: "editChannel" | "deleteChannel") => {
        e.stopPropagation();
        onOpen(action, { channel, server });
    };

    return (
        <button
            onClick={onClick}
            className={cn(
                "group relative mx-2 px-2 py-3 flex items-center gap-x-2 w-[calc(100%-1rem)] rounded-lg hover:bg-white/5 transition mb-[2px]",
                isActive && "bg-white/[0.07]"
            )}
        >
            <Icon className={cn("flex-shrink-0 w-5 h-5 text-flexwhite/40", isActive && "text-white")} />
            <p
                className={cn(
                    "line-clamp-1 font-medium text-sm text-flexwhite/50 group-hover:text-flexwhite/80 transition text-left",
                    isActive && "text-flexwhite group-hover:text-flexwhite",
                    hasUnread && "font-bold text-flexwhite group-hover:text-flexwhite"
                )}
            >
                {channel.name}
            </p>
            {hasUnread && (
                <span
                    aria-label={`${channel.unreadCount} unread messages`}
                    className="ml-auto mr-1 flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-pastelred px-1 text-[10px] font-bold leading-none text-white group-hover:hidden"
                >
                    {(channel.unreadCount ?? 0) > 99 ? "99+" : channel.unreadCount}
                </span>
            )}

            {channel.name !== "general" && role !== "GUEST" && (
                <div className="ml-auto flex items-center gap-x-2">
                    <TooltipProvider delayDuration={50}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Edit
                                    onClick={(e) => onAction(e, "editChannel")}
                                    className="hidden group-hover:block w-4 h-4 text-zinc-400 hover:text-zinc-300 transition"
                                />
                            </TooltipTrigger>
                            <TooltipContent side="top"><p className="text-xs">Edit</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider delayDuration={50}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <TrashIcon
                                    onClick={(e) => onAction(e, "deleteChannel")}
                                    className="hidden group-hover:block w-5.5 h-5.5 text-zinc-400 hover:text-zinc-300 transition"
                                />
                            </TooltipTrigger>
                            <TooltipContent side="top"><p className="text-xs">Delete</p></TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            )}

            {channel.name === "general" && (
                <LockIcon className="ml-auto w-5.5 h-5.5 text-zinc-400" />
            )}
        </button>
    );
}
