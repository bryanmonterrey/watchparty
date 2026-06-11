"use client";

import { Home, MessageSquare, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { CommunitiesIcon, WaveIcon, TeamIcon, SearchIcon, MicIcon } from "../icons";

export function CommunityHomeSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { onOpen } = useCommunityModal();

    const routes = [
        {
            label: "Communities",
            icon: CommunitiesIcon,
            href: "/communities",
            active: pathname === "/communities",
        },
        {
            label: "Friends",
            icon: TeamIcon,
            href: "/communities/friends",
            active: pathname === "/communities/friends",
        },
        {
            label: "Spaces",
            icon: MicIcon,
            href: "/communities/spaces",
            active: pathname === "/communities/spaces",
        },
    ];

    return (
        <div className="flex flex-col h-full py-4 w-76 bg-zinc-950 shrink-0">
            <div className="p-3 -mt-1 px-2 h-12 flex items-center text-lg justify-center">
                <button
                    onClick={() => onOpen("createServer")}
                    className="relative cursor-pointer placeholder:text-lg text-lg gap-2.5 flex items-center justify-start text-zinc-500 bg-zinc-600/10 hover:bg-zinc-600/20 border border-zinc-500/5 rounded-full transition-colors w-full px-4 py-3"
                >
                    <SearchIcon className="w-7 h-7 text-zinc-500" />
                    Search
                </button>
            </div>

            <ScrollArea className="flex-1">
                <div className="space-y-[2px] mt-4">
                    {routes.map((route) => (
                        <button
                            key={route.label}
                            onClick={() => router.push(route.href)}
                            className={cn(
                                "group relative mx-2 px-3 cursor-pointer py-4 rounded-xl flex items-center gap-3 w-[calc(100%-1rem)] transition truncate",
                                route.active ? "bg-white/[0.07] text-flexwhite" : "text-flexwhite/50 hover:bg-white/5 hover:text-flexwhite/80"
                            )}
                        >
                            <route.icon className={cn(
                                "size-7 shrink-0",
                                route.active ? "text-soft-pink" : "text-white/80 group-hover:text-white/80"
                            )} />
                            <span className="text-lg font-semibold truncate leading-none">
                                {route.label}
                            </span>
                        </button>
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
