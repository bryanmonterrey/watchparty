"use client";

import { cn } from "@/lib/utils";
import { PinkStarLogo } from "@/components/icons";
import type { CoinFeedTrader } from "@/db/schema/content/coin-feed";

// The overlapping cluster of faces that leads every trade alert.
//
// Wallet addresses are NEVER rendered (project rule) — an unknown wallet gets a
// deterministic colour derived from its address, so the same wallet keeps the
// same face across rows without ever showing the string. Wallets that map to a
// watchparty account show the real avatar instead.

const SHOWN = 3;

// The cluster, measured off the alert designs. Three slots, and the sizes are
// NOT equal — 14 / 12 / 10px, roughly 1 : 0.85 : 0.7. That taper is what makes
// it read as a cluster of faces rather than a row of chips, and it's the detail
// an equal-size stack loses.
//
// Positions are absolute inside a 26px box: the two larger side by side with the
// second dropped 4px, the smallest tucked under and between them.
const SLOTS = [
    { size: "size-3.5", pos: "left-0 top-0" },
    { size: "size-3", pos: "left-[11px] top-[4px]" },
    { size: "size-2.5", pos: "left-[4px] top-[15px]" },
];

// Same palette the trending cards pull from, so anonymous traders read as part
// of the app rather than as random swatches.
const SEED_PALETTE = [
    "var(--color-jewel)",
    "var(--color-soft-pink)",
    "var(--color-soft-blue)",
    "var(--color-bleu)",
    "var(--color-pastel-yellow)",
    "var(--color-bitcoin-orange)",
    "var(--color-vice-purple)",
    "var(--color-pastelred)",
];

// Hashed, not random: a row can re-render (or SSR) and must not change face.
function seedColor(seed: string) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return SEED_PALETTE[h % SEED_PALETTE.length];
}

export function TraderStack({
    traders,
    total,
    className,
}: {
    traders: CoinFeedTrader[] | null | undefined;
    /** Distinct trader count for the event — may exceed what we stored. */
    total?: number | null;
    className?: string;
}) {
    const list = (traders ?? []).slice(0, SHOWN);
    if (list.length === 0) return null;

    // No "+N" bubble. The designs show three faces and stop — at 10px the
    // smallest circle can't hold a legible count anyway, and the headline
    // already says how many traders there were.

    return (
        // A TRIANGLE of unequal circles, not a row — see SLOTS. Absolute offsets
        // rather than a grid, because the circles deliberately OVERLAP and the
        // overlap is the whole look. Side by side they also ate most of a 288px
        // rail before the headline got a character.
        <div className={cn("relative size-6.5 shrink-0", className)}>
            {list.map((t, i) => (
                <span
                    key={t.address ?? i}
                    // ring-canvas, not a border: the faces overlap, and a
                    // hairline border would read as a seam where they meet.
                    //
                    // z rises with i, so each SMALLER circle sits over the one
                    // before it — the taper only reads if the small one is in
                    // front.
                    className={cn(
                        "absolute flex items-center justify-center overflow-hidden rounded-full ring-2 ring-canvas",
                        SLOTS[i].size,
                        SLOTS[i].pos,
                    )}
                    style={{ zIndex: i, backgroundColor: t.avatarUrl ? undefined : seedColor(t.address ?? String(i)) }}
                >
                    {t.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.avatarUrl} alt="" loading="lazy" className="size-full object-cover" />
                    ) : (
                        // The mark inside an anonymous face, matching the designs
                        // — the brand star rather than an initial (letter
                        // fallbacks are out app-wide, and a wallet has no name to
                        // take one from anyway). Sized as a fraction so it holds
                        // its proportion across all three circle sizes.
                        <PinkStarLogo className="size-[58%]" />
                    )}
                </span>
            ))}
        </div>
    );
}
