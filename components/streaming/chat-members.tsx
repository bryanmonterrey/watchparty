"use client";

import { useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { MiniProfile } from "@/components/profile/mini-profile-card";
import { resolveChatNameColor } from "@/lib/chat/chat-name-color";
import type { PresenceUser } from "@/lib/realtime/protocol";

// Who's in the room, behind the viewers button.
//
// The roster is PULLED when this opens, not kept live: a stream-chat room turns
// continuous presence off on purpose (broadcasting a roster on every join and
// leave is O(N^2) at fan-out), so opening this asks once and gets one answer.
// It's a snapshot, and it says so rather than pretending to be live.

export function ChatMembers({
    members,
    onRequest,
    onClose,
}: {
    members: PresenceUser[] | null;
    onRequest: () => void;
    onClose: () => void;
}) {
    // Ask on open, and again if the socket reconnects underneath us.
    useEffect(() => {
        onRequest();
    }, [onRequest]);

    return (
        <div className="absolute inset-0 z-30 flex flex-col bg-canvas">
            <div className="flex items-center gap-2 px-1 pb-3 pt-1">
                <h2 className="flex-1 text-[15px] font-bold text-flexwhite">
                    In chat{members ? ` · ${members.length}` : ""}
                </h2>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="close members"
                    className="cursor-pointer text-zinc-400 transition-colors hover:text-white"
                >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-5" strokeWidth={2.5} />
                </button>
            </div>

            <div className="hidden-scrollbar min-h-0 flex-1 overflow-y-auto px-1 pb-2">
                {!members && (
                    <div className="flex flex-col gap-1.5 pt-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-8 rounded-lg bg-soft-gray-10" />
                        ))}
                    </div>
                )}

                {members?.length === 0 && (
                    <p className="py-8 text-center text-sm font-medium text-zinc-500">Nobody else is here</p>
                )}

                {members?.map((m) => (
                    <MiniProfile key={m.userId} userId={m.userId} triggerClassName="block">
                        <div className="cursor-pointer rounded-lg px-2 py-1.5 text-left text-sm font-bold transition-colors hover:bg-white/[0.06]">
                            <span style={{ color: resolveChatNameColor(m.userId) }}>{m.userName}</span>
                        </div>
                    </MiniProfile>
                ))}
            </div>
        </div>
    );
}
