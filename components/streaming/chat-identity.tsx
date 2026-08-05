"use client";

import { trpc } from "@/lib/trpc/client";
import { BadgeGlyph } from "@/components/profile/badge-glyphs";
import { resolveChatNameColor } from "@/lib/chat/chat-name-color";

// Chat-line identity (design brief §2, owner decision 2026-07-19): the level
// + the single top earned badge (badges[0] — catalog order IS priority), one
// tiny glyph, nothing denser. Reads the same cached profile.card the popout
// uses; react-query dedupes per userId and tRPC batches, so a busy chat costs
// one request per unique chatter per 5 min.
//
// These sit where the avatar used to (see chat-line.tsx). The level is a filled
// chip now rather than loose "LV n" text — at 13px in a rail a bare number
// beside a name reads as part of the name, and the chip is what separates them.
// It's tinted with the chatter's own name colour so the badges and the name read
// as one unit: chat CHROME stays neutral, but identity is where colour earns its
// keep. text-lantern is gone with it.

const CARD_STALE_MS = 5 * 60 * 1000;

export function ChatIdentity({ userId }: { userId: string }) {
    const { data } = trpc.profile.card.useQuery(
        { userId },
        { staleTime: CARD_STALE_MS, enabled: !!userId },
    );
    if (!data) return null;
    const top = data.badges[0];
    const color = resolveChatNameColor(userId, data.chatColor);
    return (
        <span className="mr-1.5 inline-flex items-center gap-1 align-middle">
            <span
                className="inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-[4px] px-[3px] font-pixel text-[9px] leading-none"
                style={{ color, backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)` }}
                title={`level ${data.level}`}
            >
                {data.level}
            </span>
            {top && <BadgeGlyph id={top.id} className="size-3.5 shrink-0" />}
        </span>
    );
}
