"use client";

import { type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface FeedTabProps {
    label: string;
    isActive: boolean;
    onClick: () => void;
    suffix?: ReactNode;
    className?: string;
}

export function FeedTab({ label, isActive, onClick, suffix, className }: FeedTabProps) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex-1 h-13 w-fit cursor-pointer flex items-center justify-center backdrop-blur-md bg-panel1/25 hover:bg-panel2 transition-colors group",
                className
            )}
        >
            {/* Invisible spacer mirrors the suffix width to keep label centered */}
            {suffix && <span className="ml-1 flex items-center opacity-0 pointer-events-none">{suffix}</span>}
            {/* Label + icon + underline — the suffix lives inside this container so the
                underline (inset-x-0) spans both the title and the icon. */}
            <div className="relative h-full flex items-center">
                <span className={cn(
                    "text-[15px] font-bold transition-colors",
                    isActive ? "text-zinc-100" : "text-zinc-500 group-hover:text-zinc-300"
                )}>
                    {label}
                </span>
                {suffix && <span className="ml-1 flex items-center">{suffix}</span>}
                {isActive && (
                    <motion.div
                        // Shared across the bar's FeedTab instances so the underline
                        // slides from the old tab to the new one on switch.
                        layoutId="feed-tab-underline"
                        transition={{ type: "spring", stiffness: 550, damping: 45 }}
                        className="absolute bottom-0 inset-x-0 h-[4px] bg-twitter2 rounded-full"
                    />
                )}
            </div>
        </button>
    );
}
