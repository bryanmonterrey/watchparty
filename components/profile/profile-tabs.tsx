"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

// Replies + Articles were folded into the Posts tab's filter rail
// (Show: Replies / Type: Articles) — 2026-07-22.
export const TABS = [
    "Home",
    "About",
    "Streams",
    "Posts",
    "Media",
    "Videos",
    "Coins",
    "Trades",
];

interface ProfileTabsProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    isMinimized?: boolean;
    /** Optional right-aligned control on the tabs row (e.g. the resize toggle). */
    action?: ReactNode;
}

export function ProfileTabs({ activeTab, onTabChange, isMinimized, action }: ProfileTabsProps) {
    return (
        <div className={cn("relative z-30 transition-all duration-300", isMinimized ? "mt-2 mb-3" : "mt-5")}>
            <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    <div className={cn("flex min-w-max transition-all duration-300", isMinimized ? "gap-6" : "gap-9")}>
                        {TABS.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => onTabChange(tab)}
                            className={cn(
                                "text-lg cursor-pointer  font-semibold transition-all relative",
                                activeTab === tab
                                    ? "text-white"
                                    : "text-zinc-400 hover:text-zinc-300"
                            )}
                        >
                            {tab}
                            {activeTab === tab && (
                                <motion.div
                                    // Both the full and minimized bars stay mounted at once,
                                    // so each needs its own layoutId or the underline would
                                    // morph between bars instead of between tabs.
                                    layoutId={isMinimized ? "profile-tab-underline-min" : "profile-tab-underline"}
                                    transition={{ type: "spring", stiffness: 550, damping: 45 }}
                                    className=" absolute left-0 right-0 h-[3px] bg-twitter2 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.5)]"
                                />
                            )}
                        </button>
                        ))}
                    </div>
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
        </div>
    );
}
