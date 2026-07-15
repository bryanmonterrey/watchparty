"use client";

import { useState } from "react";
import { Reorder } from "motion/react";
import { trpc } from "@/lib/trpc/client";
import { CommunityChannelItem } from "./community-channel-item";
import type { CommunityChannel, CommunityServer } from "@/db/schema/community";

type Channel = CommunityChannel & { unreadCount?: number };

// Drag-to-reorder wrapper for a channel section (mods/admins). Order is local
// while dragging; on drop the FULL server-wide order (all sections, in section
// order) commits through reorderChannels so positions stay globally
// consistent. Guests get the plain list.
export function CommunityChannelReorder({
    channels,
    allChannels,
    server,
    role,
}: {
    channels: Channel[];
    /** every channel on the server, already in display order by section */
    allChannels: Channel[];
    server: CommunityServer;
    role?: string;
}) {
    const canReorder = role === "ADMIN" || role === "MODERATOR";
    const utils = trpc.useUtils();
    const reorder = trpc.community.reorderChannels.useMutation({
        onSuccess: () => utils.community.getServer.invalidate({ serverId: server.id }),
    });

    // Local order during a drag session; server data wins after invalidation.
    const [order, setOrder] = useState<string[] | null>(null);
    const ordered = order
        ? order.map((id) => channels.find((c) => c.id === id)!).filter(Boolean)
        : channels;

    if (!canReorder) {
        return (
            <div className="space-y-[2px]">
                {channels.map((channel) => (
                    <CommunityChannelItem key={channel.id} channel={channel} role={role} server={server} />
                ))}
            </div>
        );
    }

    const commit = () => {
        if (!order) return;
        // Splice this section's new order into the server-wide sequence.
        const sectionIds = new Set(channels.map((c) => c.id));
        const queue = [...order];
        const full = allChannels.map((c) => (sectionIds.has(c.id) ? queue.shift()! : c.id));
        reorder.mutate({ serverId: server.id, channelIds: full });
        setOrder(null);
    };

    return (
        <Reorder.Group
            axis="y"
            values={ordered.map((c) => c.id)}
            onReorder={(ids: string[]) => setOrder(ids)}
            className="space-y-[2px]"
        >
            {ordered.map((channel) => (
                <Reorder.Item
                    key={channel.id}
                    value={channel.id}
                    onDragEnd={commit}
                    className="cursor-grab active:cursor-grabbing"
                >
                    <CommunityChannelItem channel={channel} role={role} server={server} />
                </Reorder.Item>
            ))}
        </Reorder.Group>
    );
}
