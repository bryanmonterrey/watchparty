"use client";

import { Hash, ChevronRight } from "lucide-react";

type Props = {
    channelName: string;
    serverId: string;
    type: "channel" | "conversation";
    onlineCount?: number;
    onOpenInfo?: () => void;
};

export function CommunityChatHeader({
    channelName,
    type,
    onlineCount,
    onOpenInfo,
}: Props) {
    return (
        <button
            type="button"
            onClick={onOpenInfo}
            className="group h-14 shrink-0 px-4 flex items-center gap-x-2 bg-black2 border-b border-flexwhite/15 text-left transition-colors hover:bg-white/[0.03] w-full"
        >
            {type === "channel" && <Hash className="w-5 h-5 text-flexwhite/40 shrink-0" />}

            <div className="flex flex-col min-w-0">
                <span className="font-semibold text-[15px] text-flexwhite truncate leading-tight">
                    {channelName}
                </span>
                {typeof onlineCount === "number" && onlineCount > 0 && (
                    <span className="flex items-center gap-1.5 text-[11px] text-flexwhite/40 leading-tight">
                        <span className="h-1.5 w-1.5 rounded-full bg-twitter shadow-[0_0_6px_var(--color-twitter)]" />
                        {onlineCount} online
                    </span>
                )}
            </div>

            <ChevronRight className="ml-auto w-4 h-4 text-flexwhite/30 group-hover:text-flexwhite/60 transition-colors" />
        </button>
    );
}
