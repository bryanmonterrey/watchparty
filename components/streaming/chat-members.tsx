"use client";

import { useEffect, useMemo } from "react";
import { trpc } from "@/lib/trpc/client";
import { MiniProfile } from "@/components/profile/mini-profile-card";
import { ChatSheet } from "./chat-sheet";
import { resolveChatNameColor } from "@/lib/chat/chat-name-color";
import type { ChatRole } from "@/server/routers/stream";
import type { PresenceUser } from "@/lib/realtime/protocol";

// Who's in the room, behind the viewers button.
//
// This IS live presence. Every viewer's ChatPanel holds a socket to the room, so
// the DO's connection list is who is actually here right now — and since
// ChatPanel is no longer unmounted when the rail switches tabs (see
// stream-chat), that stays true while someone browses Online or New.
//
// It's polled rather than pushed. The room turns continuous presence OFF on
// purpose: broadcasting a roster to everyone on every join and leave is O(N^2)
// at fan-out. Asking once per REFRESH_MS is one message per open panel, from the
// handful of people who have it open — a different order of cost entirely.
//
// Two halves that only mean something together: the DO knows who is CONNECTED,
// the database knows who holds a ROLE. stream.chatRoles joins them.

/** How often the open panel re-asks. Fast enough to feel live, idle when shut. */
const REFRESH_MS = 10_000;

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
    // Ask on open, then keep asking while open. The interval is torn down with
    // the panel, so a closed roster costs nothing.
    useEffect(() => {
        onRequest();
        const id = setInterval(onRequest, REFRESH_MS);
        return () => clearInterval(id);
    }, [onRequest]);

    // Sorted here too, though the DO now guarantees it (see the `members`
    // event in the protocol). react-query hashes this straight into the query
    // key and the poll hands back a fresh array every REFRESH_MS, so an order
    // that wobbles means the same people hash differently and refetch roles on
    // every tick, staleTime or not. Cheap enough to not depend on the wire.
    const userIds = useMemo(
        () => (members ?? []).map((m) => m.userId).sort(),
        [members],
    );

    const { data: roles } = trpc.stream.chatRoles.useQuery(
        { creatorId: hostUserId, userIds },
        // Only once there's a roster to rank — an empty list is a wasted round
        // trip, and the roster arrives over the socket, not with the page.
        // Roles change on a human timescale, presence on a per-second one — so
        // the roster refreshing every REFRESH_MS must not drag a role query
        // along with it. Keyed by userIds, so this only refetches when the set
        // of people actually changes, and even then not within 5 minutes.
        { enabled: userIds.length > 0, staleTime: 5 * 60_000 },
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
        <ChatSheet title={`In chat${members ? ` · ${members.length}` : ""}`} onClose={onClose}>
            <>
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
                            <MiniProfile key={m.userId} userId={m.userId} giftCreatorId={hostUserId} triggerClassName="block">
                                <div className="cursor-pointer rounded-lg px-2 py-1.5 text-left text-sm font-bold transition-colors hover:bg-white/[0.06]">
                                    <span style={{ color: resolveChatNameColor(m.userId) }}>{m.userName}</span>
                                </div>
                            </MiniProfile>
                        ))}
                    </section>
                ))}
            </>
        </ChatSheet>
    );
}
