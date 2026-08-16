"use client";

import { Home, MessageSquare, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePathname, useRouter } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { CommunityQuickSwitcher } from "./community-quick-switcher";
import { CommunitiesIcon, WaveIcon, TeamIcon, SearchIcon, MicIcon, BagIcon, QuestsIcon } from "../icons";

export function CommunityHomeSidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [searchOpen, setSearchOpen] = useState(false);

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
        {
            label: "Shop",
            icon: BagIcon,
            href: "/communities/shop",
            active: pathname === "/communities/shop",
        },
        {
            label: "Quests",
            icon: QuestsIcon,
            href: "/communities/quests",
            active: pathname === "/communities/quests",
        },
    ];

    return (
        <div className="flex flex-col h-full py-4 w-76 shrink-0 border-l border-flexwhite/10 overflow-hidden max-md:w-full">
            <div className="p-3 -mt-1 px-2 h-12 flex items-center text-lg justify-center">
                {/* Outlined, not filled. border-border is load-bearing: the
                    globals.css hairline remap is an ATTRIBUTE selector
                    ([class*="border-border"] et al), so it only fires when such
                    a class is present — a bare `border` matches nothing and
                    falls back to currentColor, which here is text-flexwhite/35.
                    h-11 is the standard button height (design-principles §1) —
                    it was py-3 on an unset height. */}
                <button
                    onClick={() => setSearchOpen(true)}
                    className="relative cursor-pointer text-lg font-medium gap-2.5 flex items-center justify-start text-flexwhite/35 border border-border hover:bg-zinc-600/10 rounded-full transition-colors w-full px-4 h-11"
                >
                    <SearchIcon className="size-6 text-flexwhite/35" />
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
                                route.active ? "bg-white/[0.07] text-flexwhite" : "text-zinc-400 hover:bg-white/5 hover:text-flexwhite/90"
                            )}
                        >
                            <route.icon className={cn(
                                "size-6 shrink-0",
                                route.active ? "text-white" : "text-zinc-400 group-hover:text-flexwhite/90"
                            )} />
                            <span className="text-lg font-semibold truncate leading-none">
                                {route.label}
                            </span>
                        </button>
                    ))}
                </div>
            </ScrollArea>

            <CommunityQuickSwitcher open={searchOpen} onOpenChange={setSearchOpen} />
        </div>
    );
}
