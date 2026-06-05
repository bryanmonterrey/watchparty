"use client";

import { motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { InfoIcon } from "@/components/icons";
import type { DraftCard } from "../types";
import { CARD_TRANSITION, pillVariants } from "./constants";

interface TeaserPillProps {
    card: DraftCard;
    onClick: () => void;
    onDismiss: (e: React.MouseEvent) => void;
}

export function TeaserPill({ card, onClick, onDismiss }: TeaserPillProps) {
    const label = card.title || card.message || card.type;
    return (
        <motion.div
            variants={pillVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={CARD_TRANSITION}
            className=" bg-black/80 cursor-pointer backdrop-blur-sm border border-white/10 flex items-center gap-1.5 pointer-events-auto"
        >
            <button
                onClick={onClick}
                className={cn(
                    "flex flex-row items-center cursor-pointer gap-2 pl-2.5 pr-3 py-1.5",
                    "bg-black/80 backdrop-blur-sm rounded-full",
                    "text-white text-xs hover:bg-black/90 active:scale-95 transition-all shadow-lg"
                )}
            >
                <InfoIcon className="size-4 flex-shrink-0" />
                <span className="text-white/80 max-w-[120px] truncate">{label}</span>
            </button>
            <button
                onClick={onDismiss}
                className="w-5 h-5 text-white/90 cursor-pointer hover:text-white rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
            >
                <X className="size-4 text-white/90" />
            </button>
        </motion.div>
    );
}
