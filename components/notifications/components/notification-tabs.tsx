"use client"

import { motion } from "motion/react"
import { cn } from "@/lib/utils"
import { Tab } from "../types"

interface NotificationTabsProps {
    activeTab: Tab
    onTabChange: (tab: Tab) => void
}

export function NotificationTabs({ activeTab, onTabChange }: NotificationTabsProps) {
    return (
        // A real segmented control now — the two pills sit in a tracked well
        // instead of floating on the panel, so the selection has something to
        // travel along. The active fill is the panel's blue: this is the one
        // control in the header, and colour is what tells you it's live.
        <div className="shrink-0 px-5 pb-3">
            <div className="relative inline-flex items-center gap-1 rounded-full bg-white/[0.04] p-1 ring-1 ring-white/10">
                {(["All", "Comments"] as Tab[]).map((t) => (
                    <button
                        key={t}
                        onClick={() => onTabChange(t)}
                        className={cn(
                            "relative z-10 flex h-8 cursor-pointer items-center rounded-full px-4 text-[14px] font-bold transition-colors",
                            activeTab === t ? "text-white" : "text-zinc-500 hover:text-zinc-200",
                        )}
                    >
                        {t}
                        {activeTab === t && (
                            <motion.div
                                layoutId="notificationsTabHighlight"
                                className="absolute inset-0 -z-10 rounded-full bg-twitter"
                                initial={false}
                                transition={{ type: "spring", stiffness: 320, damping: 32 }}
                            />
                        )}
                    </button>
                ))}
            </div>
        </div>
    )
}
