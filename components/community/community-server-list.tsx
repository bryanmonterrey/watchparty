"use client";

import { Squircle } from "@/components/ui/squircle";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommunityServerIcon } from "./community-server-icon";
import { trpc } from "@/lib/trpc/client";
import { useState } from "react";
import { Reorder } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { HomeIcon, CreateIcon } from "@/components/icons";

export function CommunityServerList() {
    const { onOpen } = useCommunityModal();
    const router = useRouter();
    const pathname = usePathname();
    const { data: servers = [] } = trpc.community.listServers.useQuery();
    const utils = trpc.useUtils();
    const reorderRail = trpc.community.reorderRail.useMutation({
        onSuccess: () => utils.community.listServers.invalidate(),
    });
    // Local order during a drag; server order wins after invalidation.
    const [order, setOrder] = useState<string[] | null>(null);
    const ordered = order
        ? order.map((id) => servers.find((s) => s.id === id)!).filter(Boolean)
        : servers;
    const commitOrder = () => {
        if (!order) return;
        reorderRail.mutate({ serverIds: order });
        setOrder(null);
    };

    // "Home" = any community page that isn't a specific server.
    const onHome = !/^\/communities\/[0-9a-fA-F-]{20,}/.test(pathname);

    return (
        <div className="flex flex-col items-center gap-3.5 py-3 md:pt-[calc(var(--header-height)+0.25rem)] h-full w-[112px] shrink-0">
            {/* Home */}
            <TooltipProvider delayDuration={50}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={() => router.push("/communities")}
                            className="group relative flex cursor-pointer items-center justify-center w-full"
                        >
                            <Squircle asChild radius={18} autoEffects={false}>
                                <div
                                    className={cn(
                                        "flex h-[62px] w-[62px] transition-all ease-in-out duration-200 items-center justify-center",
                                        onHome
                                            ? "bg-white/90 text-black/85"
                                            : "bg-black4 text-white/90 group-hover:bg-[#6A6A6A]/50"
                                    )}
                                >
                                    <HomeIcon className="size-8" />
                                </div>
                            </Squircle>
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" align="center">
                        <p className="font-semibold text-sm">Home</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            {/* Server icons + create */}
            <ScrollArea className="flex-1 w-full [&_[data-slot=scroll-area-viewport]]:[scrollbar-width:none] [&_[data-slot=scroll-area-viewport]::-webkit-scrollbar]:hidden">
                <div className="flex flex-col items-center gap-3">
                    <Reorder.Group
                        axis="y"
                        values={ordered.map((s) => s.id)}
                        onReorder={(ids: string[]) => setOrder(ids)}
                        className="flex w-full flex-col items-center gap-3"
                    >
                        {ordered.map((server) => (
                            <Reorder.Item
                                key={server.id}
                                value={server.id}
                                onDragEnd={commitOrder}
                                className="w-full cursor-grab active:cursor-grabbing"
                            >
                                <CommunityServerIcon
                                    id={server.id}
                                    name={server.name}
                                    imageUrl={server.imageUrl}
                                    hasUnread={server.hasUnread}
                                    mentionCount={server.mentionCount}
                                />
                            </Reorder.Item>
                        ))}
                    </Reorder.Group>

                    <TooltipProvider delayDuration={50}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                {/* w-full so the tooltip anchors to the rail edge
                                    like Home/server tiles (same gap separation) */}
                                <button
                                    onClick={() => onOpen("createServer")}
                                    className="group flex w-full cursor-pointer items-center justify-center"
                                >
                                    <Squircle asChild radius={18} autoEffects={false}>
                                        <div className="flex h-[62px] w-[62px] transition-all ease-in-out duration-200 items-center justify-center bg-black4 text-white/90 group-hover:bg-[#6A6A6A]/50">
                                            <CreateIcon className="size-8" />
                                        </div>
                                    </Squircle>
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" align="center">
                                <p className="font-semibold text-sm">Add a Server</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            </ScrollArea>
        </div>
    );
}
