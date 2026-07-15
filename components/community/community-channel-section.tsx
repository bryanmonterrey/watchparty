"use client";

import { ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useCommunityModal } from "@/hooks/use-community-modal";
import type { CommunityServer } from "@/db/schema/community";
import { CreateIcon, SettingsIcon } from "../icons";
import { cn } from "@/lib/utils";

type Props = {
    label: string;
    role?: string;
    sectionType: "channels" | "members";
    channelType?: "TEXT" | "AUDIO" | "VIDEO";
    server?: CommunityServer;
    collapsed?: boolean;
    onToggleCollapsed?: () => void;
};

export function CommunityChannelSection({
    label,
    role,
    sectionType,
    channelType,
    server,
    collapsed = false,
    onToggleCollapsed,
}: Props) {
    const { onOpen } = useCommunityModal();

    return (
        <div className="flex items-center justify-between py-2 px-3">
            <button
                onClick={onToggleCollapsed}
                disabled={!onToggleCollapsed}
                className={cn(
                    "flex items-center gap-1 text-xs font-semibold text-zinc-400 transition-colors",
                    onToggleCollapsed && "cursor-pointer hover:text-zinc-200",
                )}
            >
                {onToggleCollapsed && (
                    <ChevronDown className={cn("size-3.5 transition-transform duration-200", collapsed && "-rotate-90")} />
                )}
                {label}
            </button>

            {role !== "GUEST" && sectionType === "channels" && (
                <TooltipProvider delayDuration={50}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={() => onOpen("createChannel", { channelType, server })}
                                className="text-zinc-400 hover:text-zinc-300 transition"
                            >
                                <CreateIcon className="h-5 w-5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                            <p className="text-sm font-semibold">Create Channel</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}

            {role === "ADMIN" && sectionType === "members" && (
                <TooltipProvider delayDuration={50}>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={() => onOpen("members", { server })}
                                className="text-zinc-400 hover:text-zinc-300 transition"
                            >
                                <SettingsIcon className="h-5 w-5" />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                            <p className="text-sm font-semibold">Manage Members</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
        </div>
    );
}
