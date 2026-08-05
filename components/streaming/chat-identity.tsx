"use client";

import { trpc } from "@/lib/trpc/client";
import { BadgeGlyph } from "@/components/profile/badge-glyphs";
import { Hint } from "@/components/ui/hint";
import { BADGE_BY_ID } from "@/lib/badges";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
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
//
// Three slots, in this order: level, verification, top earned badge. Verified
// was missing entirely — every other place a name appears (rail rows, the
// profile header, mini profile) carries the tier mark, and chat was the one
// surface where you couldn't tell an impersonator from the real account, which
// is exactly where that matters most.

const CARD_STALE_MS = 5 * 60 * 1000;

/**
 * Badges that don't earn their slot on a chat line.
 *
 * "Launcher" is granted for launching a coin, and on this app launching is the
 * ordinary path for anything a creator posts — so nearly everyone ends up with
 * it and a mark everyone has distinguishes nobody. It stays on the profile
 * strip, where the full set is the point; it just doesn't win the one slot a
 * chat line has.
 */
const NOT_IN_CHAT = new Set(["token_launcher"]);

export function ChatIdentity({ userId }: { userId: string }) {
    const { data } = trpc.profile.card.useQuery(
        { userId },
        { staleTime: CARD_STALE_MS, enabled: !!userId },
    );
    if (!data) return null;
    // badges[0] is catalog order, i.e. priority — take the first one that's
    // worth a slot rather than the first one outright.
    const top = data.badges.find((b) => !NOT_IN_CHAT.has(b.id));
    const color = resolveChatNameColor(userId, data.chatColor);
    return (
        <span className="mr-1.5 inline-flex items-center gap-1 align-middle">
            <Hint label={`Level ${data.level}`} placement="top" asChild>
                <span
                    className="inline-flex h-[15px] min-w-[15px] items-center justify-center rounded-[4px] px-[3px] font-pixel text-[9px] leading-none"
                    style={{ color, backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)` }}
                >
                    {data.level}
                </span>
            </Hint>
            {data.verifiedTier === "verified" && <VerifiedBadgeIcon className="size-4 shrink-0" />}
            {data.verifiedTier === "business" && <BusinessBadgeIcon className="size-4 shrink-0" />}
            {data.verifiedTier === "government" && <GovBadgeIcon className="size-4 shrink-0" />}
            {/* 16px, not 14: the glyph is a 16-unit pixel grid, so at any other
                size each "pixel" lands on a fraction of a device pixel and
                crispEdges snaps them to uneven widths. 1:1 is the only size a
                pixel glyph is actually crisp at. */}
            {top && (
                // Same hint the community server icons use — top-centred, so a
                // 16px glyph on a chat line is identifiable without a click.
                <Hint label={BADGE_BY_ID[top.id]?.name ?? top.id} placement="top" asChild>
                    <span className="inline-flex">
                        <BadgeGlyph id={top.id} className="size-4 shrink-0" />
                    </span>
                </Hint>
            )}
        </span>
    );
}
