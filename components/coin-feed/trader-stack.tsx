"use client";

import { cn } from "@/lib/utils";
import type { CoinFeedTrader } from "@/db/schema/content/coin-feed";

// The overlapping cluster of faces that leads every trade alert.
//
// Wallet addresses are NEVER rendered (project rule) — an unknown wallet gets a
// deterministic colour derived from its address, so the same wallet keeps the
// same face across rows without ever showing the string. Wallets that map to a
// watchparty account show the real avatar instead.

const SHOWN = 3;

// Slot positions inside the 44px box, in render order. Top-left, then top-right
// dropped a few px so the pair reads as tilted rather than as a row, then the
// third tucked under and between them. Indexed by position in the list, so the
// cluster is identical whichever faces land in it.
const POSITIONS = ["left-0 top-0", "left-[18px] top-[5px]", "left-[5px] top-[20px]"];

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

    const overflow = Math.max(0, (total ?? list.length) - list.length);

    return (
        // A TRIANGLE, not a row. Three faces packed into a 44px box — one top
        // left, one top right and slightly lower, one below them — which is
        // what the alert designs use and what a horizontal -space-x row can't
        // do: side by side, three avatars ate most of a 288px rail before the
        // headline got a character.
        //
        // Absolute + fixed offsets rather than a grid: the circles deliberately
        // OVERLAP, and the overlap is the whole look.
        <div className={cn("relative size-11 shrink-0", className)}>
            {list.map((t, i) => (
                <span
                    key={t.address ?? i}
                    // ring-canvas, not a border: the faces overlap, and a
                    // hairline border would read as a seam where they meet.
                    className={cn(
                        "absolute size-6 overflow-hidden rounded-full ring-2 ring-canvas",
                        POSITIONS[i],
                    )}
                    style={{ zIndex: SHOWN - i, backgroundColor: t.avatarUrl ? undefined : seedColor(t.address ?? String(i)) }}
                >
                    {t.avatarUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.avatarUrl} alt="" loading="lazy" className="size-full object-cover" />
                    )}
                </span>
            ))}
            {/* Overflow takes the third slot when there are only two faces to
                show, so the cluster keeps its triangle instead of collapsing to
                a pair. With three faces already placed there's nowhere left, and
                the count is dropped — the headline says "80 traders" anyway. */}
            {overflow > 0 && list.length < SHOWN && (
                <span
                    className={cn(
                        "absolute z-0 flex size-6 items-center justify-center rounded-full bg-sidebar-hover ring-2 ring-canvas",
                        POSITIONS[list.length],
                    )}
                >
                    <span className="text-[9px] font-bold tabular-nums text-zinc-400">+{overflow > 99 ? "99" : overflow}</span>
                </span>
            )}
        </div>
    );
}
