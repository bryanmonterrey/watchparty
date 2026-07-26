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

// Same palette the trending cards pull from, so anonymous traders read as part
// of the app rather than as random swatches.
const SEED_PALETTE = [
    "var(--color-jewel)",
    "var(--color-soft-pink)",
    "var(--color-soft-blue)",
    "var(--color-royal-blue)",
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
        <div className={cn("flex shrink-0 items-center -space-x-2", className)}>
            {list.map((t, i) => (
                <span
                    key={t.address ?? i}
                    // ring-canvas, not a border: the faces overlap, and a
                    // hairline border would read as a seam where they meet.
                    className="relative size-6 overflow-hidden rounded-full ring-2 ring-[#080808]"
                    style={{ zIndex: SHOWN - i, backgroundColor: t.avatarUrl ? undefined : seedColor(t.address ?? String(i)) }}
                >
                    {t.avatarUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.avatarUrl} alt="" loading="lazy" className="size-full object-cover" />
                    )}
                </span>
            ))}
            {overflow > 0 && (
                <span className="relative z-0 flex size-6 items-center justify-center rounded-full bg-sidebar-hover ring-2 ring-[#080808]">
                    <span className="text-[9px] font-bold tabular-nums text-zinc-400">+{overflow > 99 ? "99" : overflow}</span>
                </span>
            )}
        </div>
    );
}
