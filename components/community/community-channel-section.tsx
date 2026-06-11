"use client";

import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useCommunityModal } from "@/hooks/use-community-modal";
import type { CommunityServer } from "@/db/schema/community";
import { CreateIcon, SettingsIcon } from "../icons";

type Props = {
    label: string;
    role?: string;
    sectionType: "channels" | "members";
    channelType?: "TEXT" | "AUDIO" | "VIDEO";
    server?: CommunityServer;
};

export function CommunityChannelSection({
    label,
    role,
    sectionType,
    channelType,
    server,
}: Props) {
    const { onOpen } = useCommunityModal();

    return (
        <div className="flex items-center justify-between py-2 px-3">
            <p className="text-xs uppercase font-semibold text-zinc-400">
                {label}
            </p>

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
