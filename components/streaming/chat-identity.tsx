"use client";

import { trpc } from "@/lib/trpc/client";
import { BadgeGlyph } from "@/components/profile/badge-glyphs";

// Chat-line identity (design brief §2, owner decision 2026-07-19): the level
// + the single top earned badge (badges[0] — catalog order IS priority), one
// tiny glyph, nothing denser. Reads the same cached profile.card the popout
// uses; react-query dedupes per userId and tRPC batches, so a busy chat costs
// one request per unique chatter per 5 min.

const CARD_STALE_MS = 5 * 60 * 1000;

export function ChatIdentity({ userId }: { userId: string }) {
    const { data } = trpc.profile.card.useQuery(
        { userId },
        { staleTime: CARD_STALE_MS, enabled: !!userId },
    );
    if (!data) return null;
    const top = data.badges[0];
    return (
        <span className="mr-1.5 inline-flex items-center gap-1 align-middle">
            <span className="font-pixel text-[9px] leading-none text-lantern">LV {data.level}</span>
            {top && <BadgeGlyph id={top.id} className="size-3.5 shrink-0" />}
        </span>
    );
}
