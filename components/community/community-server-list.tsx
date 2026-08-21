"use client";

import { Squircle } from "@/components/ui/squircle";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommunityRailPill, CommunityServerIcon } from "./community-server-icon";
import { trpc } from "@/lib/trpc/client";
import { useState } from "react";
import { Reorder } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CreateIcon, PinkStarLogo } from "@/components/icons";

export function CommunityServerList() {
    const { onOpen } = useCommunityModal();
    const router = useRouter();
    const pathname = usePathname();
    const { data: servers = [], isLoading: serversLoading } = trpc.community.listServers.useQuery();
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
    // The home tile's unread pill mirrors a server's: the home area's only
    // inbox is friend requests waiting on the user.
    const { data: pendingFriends = 0 } = trpc.friends.pendingCount.useQuery();
    const homeHasUnread = pendingFriends > 0;

    // Rail gutter is aligned to the header's menu icon (pl-4) and clears the
    // sidebar column by pr-5 — 16 + 48 + 20 = 84px total.
    return (
        <div className="flex flex-col items-center gap-3 py-3 pr-1 md:pt-[calc(var(--header-height)+0.25rem)] h-full w-[80px] shrink-0">
            {/* Home — the star logo; the only squircle in the rail (servers are circles) */}
            <TooltipProvider delayDuration={50}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={() => router.push("/communities")}
                            className="group relative flex cursor-pointer items-center justify-center w-full"
                        >
                            <Squircle asChild radius={14} autoEffects={false}>
                                <div
                                    className={cn(
                                        "flex size-11 transition-all ease-in-out duration-200 items-center justify-center",
                                        onHome
                                            ? "bg-soft-gray-20"
                                            : "bg-soft-gray-15 group-hover:bg-soft-gray-20"
                                    )}
                                >
                                    <PinkStarLogo className="size-5" />
                                </div>
                            </Squircle>
                            <CommunityRailPill isActive={onHome} hasUnread={homeHasUnread} />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" align="center">
                        <p className="font-semibold text-sm">Home</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            {/* Server icons + create */}
            <ScrollArea className="flex-1 w-full [&_[data-slot=scroll-area-viewport]]:[scrollbar-width:none] [&_[data-slot=scroll-area-viewport]::-webkit-scrollbar]:hidden">
                <div className="flex flex-col items-center gap-2">
                    {/* While the server list is in flight the rail used to
                        show only the home tile and the create button, and the
                        icons POPPED in — three tiles at the real icon geometry
                        (size-12 circle incl. its 2px border) hold the space,
                        flat fills per the skeleton standard. */}
                    {serversLoading &&
                        Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="flex w-full items-center justify-center">
                                <div className="size-12 rounded-full shimmer-skeleton" />
                            </div>
                        ))}
                    <Reorder.Group
                        axis="y"
                        values={ordered.map((s) => s.id)}
                        onReorder={(ids: string[]) => setOrder(ids)}
                        className="flex w-full flex-col items-center gap-2"
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
                                    <div className="flex size-12 rounded-full transition-all ease-in-out duration-200 items-center justify-center bg-soft-gray-15 text-white/90 group-hover:bg-soft-gray-20">
                                        <CreateIcon className="size-7" />
                                    </div>
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
