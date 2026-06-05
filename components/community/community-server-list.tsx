"use client";

import { Plus, Home } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CommunityServerIcon } from "./community-server-icon";
import { trpc } from "@/lib/trpc/client";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function CommunityServerList() {
    const { onOpen } = useCommunityModal();
    const router = useRouter();
    const pathname = usePathname();
    const { data: servers = [] } = trpc.community.listServers.useQuery();

    // "Home" = any community page that isn't a specific server.
    const onHome = !/^\/communities\/[0-9a-fA-F-]{20,}/.test(pathname);

    return (
        <div className="flex flex-col items-center gap-2 py-3 h-full w-[72px] shrink-0 bg-black1 border-r border-flexwhite/10">
            {/* Home */}
            <TooltipProvider delayDuration={50}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            onClick={() => router.push("/communities")}
                            className="group relative flex cursor-pointer items-center justify-center w-full"
                        >
                            {onHome && <span className="absolute left-0 h-9 w-1 rounded-r-full bg-twitter" />}
                            <div
                                className={cn(
                                    "flex h-[44px] w-[44px] rounded-[16px] transition-all ease-in-out duration-200 items-center justify-center",
                                    onHome
                                        ? "bg-twitter text-white"
                                        : "bg-black4 text-flexwhite/70 group-hover:bg-twitter group-hover:text-white group-hover:rounded-[14px]"
                                )}
                            >
                                <Home size={22} />
                            </div>
                        </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" align="center">
                        <p className="font-semibold text-sm">Home</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>

            {/* Divider */}
            <div className="h-px w-8 bg-flexwhite/10 my-1" />

            {/* Server icons + create */}
            <ScrollArea className="flex-1 w-full">
                <div className="flex flex-col items-center gap-2">
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
                                <button
                                    onClick={() => onOpen("createServer")}
                                    className="group flex cursor-pointer items-center justify-center"
                                >
                                    <div className="flex h-[44px] w-[44px] rounded-[16px] group-hover:rounded-[14px] transition-all ease-in-out duration-200 items-center justify-center bg-black4 text-twitter group-hover:bg-twitter group-hover:text-white">
                                        <Plus size={24} />
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
