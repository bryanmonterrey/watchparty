"use client";

import { useEffect, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { MiniProfile } from "@/components/profile/mini-profile-card";
import { resolveChatNameColor } from "@/lib/chat/chat-name-color";
import type { ChatRole } from "@/server/routers/stream";
import type { PresenceUser } from "@/lib/realtime/protocol";

// Who's in the room, behind the viewers button.
//
// The roster is PULLED when this opens, not kept live: a stream-chat room turns
// continuous presence off on purpose (broadcasting a roster on every join and
// leave is O(N^2) at fan-out), so opening this asks once and gets one answer.
// It's a snapshot, and the header says so rather than pretending to be live.
//
// Two halves that only mean something together: the DO knows who is CONNECTED,
// the database knows who holds a ROLE. stream.chatRoles joins them.

/** Section order IS the hierarchy. Plain viewers have no role and come last. */
const GROUPS: { role: ChatRole | "viewer"; label: string }[] = [
    { role: "host", label: "Host" },
    { role: "moderator", label: "Moderators" },
    { role: "vip", label: "VIPs" },
    { role: "subscriber", label: "Subscribers" },
    { role: "viewer", label: "Viewers" },
];

export function ChatMembers({
    hostUserId,
    members,
    onRequest,
    onClose,
}: {
    hostUserId: string;
    members: PresenceUser[] | null;
    onRequest: () => void;
    onClose: () => void;
}) {
    // Ask on open, and again if the callback identity changes under us (a
    // reconnect swaps the socket).
    useEffect(() => {
        onRequest();
    }, [onRequest]);

    const userIds = useMemo(() => members?.map((m) => m.userId) ?? [], [members]);

    const { data: roles } = trpc.stream.chatRoles.useQuery(
        { creatorId: hostUserId, userIds },
        // Only once there's a roster to rank — an empty list is a wasted round
        // trip, and the roster arrives over the socket, not with the page.
        { enabled: userIds.length > 0, staleTime: 60_000 },
    );

    const grouped = useMemo(() => {
        if (!members) return null;
        const byRole = new Map<string, PresenceUser[]>();
        for (const m of members) {
            const role = roles?.[m.userId] ?? "viewer";
            const list = byRole.get(role);
            if (list) list.push(m);
            else byRole.set(role, [m]);
        }
        // Alphabetical inside a section — arrival order is meaningless to a
        // reader, and a list that reshuffles on every reopen looks broken.
        for (const list of byRole.values()) {
            list.sort((a, b) => a.userName.localeCompare(b.userName));
        }
        return GROUPS.map((g) => ({ ...g, users: byRole.get(g.role) ?? [] })).filter((g) => g.users.length);
    }, [members, roles]);

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
                {!grouped && (
                    <div className="flex flex-col gap-1.5 pt-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-8 rounded-lg bg-soft-gray-10" />
                        ))}
                    </div>
                )}

                {grouped?.length === 0 && (
                    <p className="py-8 text-center text-sm font-medium text-zinc-500">Nobody else is here</p>
                )}

                {grouped?.map((group) => (
                    <section key={group.role} className="mb-3">
                        <h3 className="px-2 pb-1 text-[13px] font-medium text-zinc-500">
                            {group.label} · {group.users.length}
                        </h3>
                        {group.users.map((m) => (
                            <MiniProfile key={m.userId} userId={m.userId} triggerClassName="block">
                                <div className="cursor-pointer rounded-lg px-2 py-1.5 text-left text-sm font-bold transition-colors hover:bg-white/[0.06]">
                                    <span style={{ color: resolveChatNameColor(m.userId) }}>{m.userName}</span>
                                </div>
                            </MiniProfile>
                        ))}
                    </section>
                ))}
            </div>
        </div>
    );
}
