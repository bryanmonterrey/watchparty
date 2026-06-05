"use client";

import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RetweetIcon, QuoteIcon } from "@/components/icons";
import { ActionButton } from "./action-button";

interface RepostMenuProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    reposted: boolean;
    repostCount: number;
    onRepostClick: (e: React.MouseEvent) => void;
    onDoRepost: () => void;
    onDoQuote: () => void;
    className?: string;
    buttonClassName?: string;
    iconSize?: string;
    hideCountAtZero?: boolean;
}

export function RepostMenu({
    open,
    onOpenChange,
    reposted,
    repostCount,
    onRepostClick,
    onDoRepost,
    onDoQuote,
    className,
    buttonClassName,
    iconSize = "w-[18px] h-[18px]",
    hideCountAtZero = true,
}: RepostMenuProps) {
    return (
        <Popover open={open} onOpenChange={onOpenChange}>
            <PopoverTrigger asChild>
                <div onClick={(e) => e.stopPropagation()} className={className}>
                    <ActionButton
                        icon={<RetweetIcon className={iconSize} />}
                        count={repostCount}
                        hideCountAtZero={hideCountAtZero}
                        hoverColor="hover:text-emerald-500"
                        hoverBg="hover:bg-emerald-500/10"
                        onClick={onRepostClick}
                        active={reposted || open}
                        activeColor="text-emerald-500"
                        className={buttonClassName}
                    />
                </div>
            </PopoverTrigger>
            <PopoverContent
                side="top"
                align="start"
                sideOffset={8}
                className="w-48 bg-neutral-950 border-flexborder/75 rounded-3xl shadow-[0_0_15px_5px_rgba(255,255,255,0.1)] ring ring-white/10 p-1.5 overflow-hidden z-50 flex flex-col gap-1"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={onDoRepost}
                    className="flex cursor-pointer items-center gap-3 w-full px-4 py-2.5 text-lg font-bold text-zinc-200 hover:bg-white/5 hover:text-white rounded-full transition-colors text-left group"
                >
                    <RetweetIcon className="w-5 h-5 text-white group-hover:text-white transition-colors" />
                    {reposted ? "Undo repost" : "Repost"}
                </button>
                <button
                    onClick={onDoQuote}
                    className="flex cursor-pointer items-center gap-3 w-full px-4 py-2.5 text-lg font-bold text-zinc-200 hover:bg-white/5 hover:text-white rounded-full transition-colors text-left group"
                >
                    <QuoteIcon className="w-5 h-5 text-white group-hover:text-white transition-colors" />
                    Quote
                </button>
            </PopoverContent>
        </Popover>
    );
}
