"use client";

import { useState } from "react";
import { Hash, ChevronRight } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { PinIcon } from "@hugeicons/core-free-icons";
import { CommunityPinnedDialog } from "./community-pinned-dialog";

type Props = {
    channelName: string;
    serverId: string;
    type: "channel" | "conversation";
    onlineCount?: number;
    onOpenInfo?: () => void;
    channelId?: string;
};

export function CommunityChatHeader({
    channelName,
    type,
    onlineCount,
    onOpenInfo,
    channelId,
}: Props) {
    const [pinnedOpen, setPinnedOpen] = useState(false);

    return (
        <div className="group h-17 shrink-0 flex items-center bg-black/50 backdrop-blur-xl w-full">
            <button
                type="button"
                onClick={onOpenInfo}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-x-2 self-stretch px-4 text-left transition-colors hover:bg-white/[0.05]"
            >
                {type === "channel" && <Hash className="w-7 h-7 text-flexwhite/40 shrink-0" />}

                <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-lg text-flexwhite truncate leading-tight">
                        {channelName}
                    </span>
                </div>

                <ChevronRight className="ml-auto w-4 h-4 text-flexwhite/30 group-hover:text-flexwhite/60 transition-colors" />
            </button>

            {type === "channel" && channelId && (
                <>
                    <button
                        type="button"
                        onClick={() => setPinnedOpen(true)}
                        aria-label="Pinned messages"
                        className="mx-2 grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-flexwhite/40 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <HugeiconsIcon icon={PinIcon} className="size-5" strokeWidth={2} />
                    </button>
                    <CommunityPinnedDialog
                        channelId={channelId}
                        channelName={channelName}
                        open={pinnedOpen}
                        onOpenChange={setPinnedOpen}
                    />
                </>
            )}
        </div>
    );
}
