"use client";

import { cn } from "@/lib/utils";

export const TABS = [
    "Home",
    "About",
    "Streams",
    "Posts",
    "Replies",
    "Media",
    "Videos",
    "Coins",
    "Trades",
    "Articles",
];

interface ProfileTabsProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    isMinimized?: boolean;
}

export function ProfileTabs({ activeTab, onTabChange, isMinimized }: ProfileTabsProps) {
    return (
        <div className={cn("relative z-30 transition-all duration-300", isMinimized ? "mt-2" : "mt-5")}>
            <div className="w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                <div className={cn("flex min-w-max transition-all duration-300", isMinimized ? "gap-6" : "gap-9")}>
                    {TABS.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => onTabChange(tab)}
                            className={cn(
                                "pb-3 text-2xl cursor-pointer font-semibold transition-all relative",
                                activeTab === tab 
                                    ? "text-white" 
                                    : "text-zinc-400 hover:text-zinc-300"
                            )}
                        >
                            {tab}
                            {activeTab === tab && (
                                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-twitter2 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.5)]" />
                            )}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
