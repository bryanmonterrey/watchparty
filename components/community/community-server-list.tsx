"use client";

import { Squircle } from "@/components/ui/squircle";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommunityServerIcon } from "./community-server-icon";
import { trpc } from "@/lib/trpc/client";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { HomeIcon, CreateIcon } from "@/components/icons";

export function CommunityServerList() {
    const { onOpen } = useCommunityModal();
    const router = useRouter();
    const pathname = usePathname();
    const { data: servers = [] } = trpc.community.listServers.useQuery();

    // "Home" = any community page that isn't a specific server.
    const onHome = !/^\/communities\/[0-9a-fA-F-]{20,}/.test(pathname);

    return (
        <div className="flex flex-col items-center gap-3.5 py-3 h-full w-[99px] shrink-0">
            {/* Home */}
            <TooltipProvider delayDuration={50}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={() => router.push("/communities")}
                            className="group relative flex cursor-pointer items-center justify-center w-full"
                        >
                            <Squircle asChild radius={16} autoEffects={false}>
                                <div
                                    className={cn(
                                        "flex h-[55px] w-[55px] transition-all ease-in-out duration-200 items-center justify-center",
                                        onHome
                                            ? "bg-white/90 text-black/85"
                                            : "bg-black4 text-white group-hover:bg-white/90 group-hover:text-black/85"
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
            <ScrollArea className="flex-1 w-full">
                <div className="flex flex-col items-center gap-3">
                    {servers.map((server) => (
                        <CommunityServerIcon
                            key={server.id}
                            id={server.id}
                            name={server.name}
                            imageUrl={server.imageUrl}
                        />
                    ))}

                    <TooltipProvider delayDuration={50}>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                {/* w-full so the tooltip anchors to the rail edge
                                    like Home/server tiles (same gap separation) */}
                                <button
                                    onClick={() => onOpen("createServer")}
                                    className="group flex w-full cursor-pointer items-center justify-center"
                                >
                                    <Squircle asChild radius={16} autoEffects={false}>
                                        <div className="flex h-[55px] w-[55px] transition-all ease-in-out duration-200 items-center justify-center bg-black4 text-white/90 group-hover:bg-white/90 group-hover:text-black/85">
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
