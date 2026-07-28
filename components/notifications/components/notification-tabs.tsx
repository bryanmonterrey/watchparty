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
        <div className="flex items-center gap-1 px-5 pb-3 shrink-0 relative">
            {(["All", "Comments"] as Tab[]).map((t) => (
                <button
                    key={t}
                    onClick={() => onTabChange(t)}
                    className={cn(
                        "py-1.5 px-3 text-[15px] font-semibold cursor-pointer rounded-full transition-all relative z-10 flex items-center gap-1.5",
                        activeTab === t
                            ? "text-white/80"
                            : "text-zinc-500 hover:text-white hover:bg-zinc-900/65"
                    )}
                >
                    {t}
                    {activeTab === t && (
                        <motion.div
                            layoutId="notificationsTabHighlight"
                            className="absolute inset-0 bg-gray1 text-white rounded-full -z-10"
                            initial={false}
                            transition={{ type: "spring", stiffness: 250, damping: 30 }}
                        />
                    )}
                </button>
            ))}
        </div>
    )
}
