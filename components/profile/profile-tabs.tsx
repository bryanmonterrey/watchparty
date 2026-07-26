"use client";

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { cn } from "@/lib/utils";

// Replies + Articles were folded into the Posts tab's filter rail
// (Show: Replies / Type: Articles) — 2026-07-22.
//
// Streams / Posts / Media / Videos then folded behind a single "Content" tab —
// four tabs for four flavours of the same thing crowded out Coins, Trades and
// Predictions. The dropdown keeps them one click away.
export const CONTENT_VARIANTS = ["Streams", "Posts", "Media", "Videos"] as const;
export type ContentVariant = (typeof CONTENT_VARIANTS)[number];

/** The tab rail. "Content" opens a dropdown; the rest select directly. */
export const TABS = ["Home", "About", "Content", "Coins", "Trades", "Predictions"];

/** Every value activeTab can actually hold, including the content variants. */
export const ALL_TAB_VALUES = [
    "Home",
    "About",
    ...CONTENT_VARIANTS,
    "Coins",
    "Trades",
    "Predictions",
];

export function isContentVariant(tab: string): tab is ContentVariant {
    return (CONTENT_VARIANTS as readonly string[]).includes(tab);
}

interface ProfileTabsProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    isMinimized?: boolean;
    /** Optional right-aligned control on the tabs row (e.g. the resize toggle). */
    action?: ReactNode;
}

export function ProfileTabs({ activeTab, onTabChange, isMinimized, action }: ProfileTabsProps) {
    const contentActive = isContentVariant(activeTab);

    return (
        <div className={cn("relative z-30 transition-all duration-300", isMinimized ? "mt-2" : "mt-5")}>
            <div className="flex items-center gap-4">
                <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    <div className={cn("flex min-w-max items-center transition-all duration-300", isMinimized ? "gap-6" : "gap-9")}>
                        {TABS.map((tab) => {
                            const isContentTab = tab === "Content";
                            const isActive = isContentTab ? contentActive : activeTab === tab;

                            // Show the selected variant rather than the generic
                            // label — "Posts" tells you where you actually are.
                            const label = isContentTab && contentActive ? activeTab : tab;

                            const underline = isActive ? (
                                <motion.div
                                    // Both the full and minimized bars stay mounted at once,
                                    // so each needs its own layoutId or the underline would
                                    // morph between bars instead of between tabs.
                                    layoutId={isMinimized ? "profile-tab-underline-min" : "profile-tab-underline"}
                                    transition={{ type: "spring", stiffness: 550, damping: 45 }}
                                    className="absolute left-0 right-0 -bottom-1 h-[3px] rounded-full bg-twitter2 shadow-[0_0_15px_rgba(255,255,255,0.5)]"
                                />
                            ) : null;

                            if (isContentTab) {
                                return (
                                    <GooDropdown
                                        key={tab}
                                        align="start"
                                        width={180}
                                        gap={10}
                                        triggerAriaLabel="Choose content type"
                                        triggerClassName={cn(
                                            "relative cursor-pointer text-lg font-semibold transition-all",
                                            isActive ? "text-white" : "text-zinc-400 hover:text-zinc-300"
                                        )}
                                        trigger={
                                            <span className="flex items-center gap-1">
                                                {label}
                                                <HugeiconsIcon
                                                    icon={ArrowDown01Icon}
                                                    className="size-4"
                                                    strokeWidth={2.5}
                                                />
                                                {underline}
                                            </span>
                                        }
                                        items={CONTENT_VARIANTS.map((variant) => ({
                                            key: variant,
                                            onClick: () => onTabChange(variant),
                                            className: cn(
                                                "cursor-pointer px-4 text-[15px] font-semibold transition-colors",
                                                activeTab === variant
                                                    ? "text-white"
                                                    : "text-zinc-400 hover:text-white"
                                            ),
                                            label: variant,
                                        }))}
                                    />
                                );
                            }

                            return (
                                <button
                                    key={tab}
                                    onClick={() => onTabChange(tab)}
                                    className={cn(
                                        "relative cursor-pointer text-lg font-semibold transition-all",
                                        isActive ? "text-white" : "text-zinc-400 hover:text-zinc-300"
                                    )}
                                >
                                    {tab}
                                    {underline}
                                </button>
                            );
                        })}
                    </div>
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
        </div>
    );
}
