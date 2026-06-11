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
            className="group h-17 shrink-0 px-4 flex items-center gap-x-2 bg-black/50 backdrop-blur-xl text-left transition-colors hover:bg-white/[0.05] w-full"
        >
            {type === "channel" && <Hash className="w-7 h-7 text-flexwhite/40 shrink-0" />}

            <div className="flex flex-col min-w-0">
                <span className="font-semibold text-lg text-flexwhite truncate leading-tight">
                    {channelName}
                </span>
            </div>

            <ChevronRight className="ml-auto w-4 h-4 text-flexwhite/30 group-hover:text-flexwhite/60 transition-colors" />
        </button>
    );
}
