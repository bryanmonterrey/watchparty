"use client";

import { cn } from "@/lib/utils";
import { PinkStarLogo } from "@/components/icons";
import type { CoinFeedTrader } from "@/db/schema/content/coin-feed";

// The cluster of faces that leads every trade alert.
//
// Wallet addresses are NEVER rendered (project rule) — an unknown wallet gets a
// deterministic colour derived from its address, so the same wallet keeps the
// same face across rows without ever showing the string. Wallets that map to a
// watchparty account show the real avatar instead.

const SHOWN = 3;

// The cluster, measured off the alert designs. Two things define it and both
// are easy to lose:
//
//   1. The sizes TAPER — 12 / 10 / 9px, largest top-left. Equal circles read as
//      a row of chips rather than a cluster of faces.
//   2. They never TOUCH. Every pair keeps a ~4px gap, so the triangle reads as
//      three separate coins rather than an overlapping stack. That's what sets
//      the geometry: the circles have to be small enough, and the box wide
//      enough, for the gaps to survive.
//
// Absolute offsets inside a 28px box, sized so the widest pair (A at 0-12, B at
// 16-26) still clears. No ring and no z-index here — both existed to manage
// where overlapping faces met, and nothing overlaps any more.
const SLOTS = [
    { size: "size-3", pos: "left-0 top-0" },
    { size: "size-2.5", pos: "left-[16px] top-[2px]" },
    { size: "size-[9px]", pos: "left-[5px] top-[16px]" },
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

    // No "+N" bubble. The designs show three faces and stop — at 9px the
    // smallest circle can't hold a legible count anyway, and the headline
    // already says how many traders there were.

    return (
        // A TRIANGLE of separated, unequal circles — see SLOTS. Absolute offsets
        // rather than a grid or a flex row: the three sit in a fixed
        // relationship to each other, and side by side they'd eat most of a
        // 288px rail before the headline got a character.
        <div className={cn("relative size-7 shrink-0", className)}>
            {list.map((t, i) => (
                <span
                    key={t.address ?? i}
                    className={cn(
                        "absolute flex items-center justify-center overflow-hidden rounded-full",
                        SLOTS[i].size,
                        SLOTS[i].pos,
                    )}
                    style={{ backgroundColor: t.avatarUrl ? undefined : seedColor(t.address ?? String(i)) }}
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
