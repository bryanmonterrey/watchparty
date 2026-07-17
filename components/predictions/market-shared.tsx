"use client";

import { format, isPast, differenceInHours } from "date-fns";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
    Bitcoin01Icon,
    ChartUpIcon,
    CrownIcon,
    FootballIcon,
    GameController03Icon,
    Globe02Icon,
    MusicNote01Icon,
    Rocket01Icon,
    Target02Icon,
    Tick02Icon,
    Tv01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

// Shared prediction-market pieces: the Kalshi-anatomy outcome row, close
// line, category glyphs, and pari-mutuel math — used by both the market
// browser cards and the market detail page.

export type MarketListItem = {
    id: string;
    question: string;
    description: string | null;
    category: string;
    status: "open" | "resolved" | "voided";
    winningOutcome: number | null;
    closesAt: string | Date;
    createdAt?: string | Date;
    feeBps: number;
    outcomes: { idx: number; label: string; poolUsdc: string }[];
};

export const usd = (baseUnits: bigint) => {
    const n = Number(baseUnits) / 1_000_000;
    return n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(n >= 10 ? 0 : 2)}`;
};

/** Implied probability of an outcome = its share of the total pool. */
export function odds(outcomes: MarketListItem["outcomes"]): number[] {
    const pools = outcomes.map((o) => BigInt(o.poolUsdc));
    const total = pools.reduce((s, p) => s + p, BigInt(0));
    if (total === BigInt(0)) return outcomes.map(() => 1 / outcomes.length);
    return pools.map((p) => Number(p) / Number(total));
}

/**
 * Pari-mutuel payout multiple for $1 on outcome i if it wins:
 * you get your stake back plus a pro-rata share of the losing pool minus fee.
 * Undefined (null) until the outcome has money on it.
 */
export function multiples(outcomes: MarketListItem["outcomes"], feeBps: number): (number | null)[] {
    const pools = outcomes.map((o) => Number(BigInt(o.poolUsdc)));
    const total = pools.reduce((s, p) => s + p, 0);
    return pools.map((p) => {
        if (p <= 0 || total <= 0) return null;
        const losing = total - p;
        return (p + losing * (1 - feeBps / 10_000)) / p;
    });
}

export const fmtMultiple = (x: number) =>
    x >= 100 ? `${Math.round(x)}x` : x >= 10 ? `${x.toFixed(1)}x` : `${x.toFixed(2)}x`;

/** Category glyph + accent — deterministic so cards read as a set. */
const CATEGORY_ICONS: Record<string, IconSvgElement> = {
    crypto: Bitcoin01Icon,
    tokens: ChartUpIcon,
    markets: ChartUpIcon,
    sports: FootballIcon,
    gaming: GameController03Icon,
    esports: GameController03Icon,
    music: MusicNote01Icon,
    culture: Tv01Icon,
    tv: Tv01Icon,
    world: Globe02Icon,
    politics: Globe02Icon,
    creators: CrownIcon,
    tech: Rocket01Icon,
    space: Rocket01Icon,
};
const ACCENTS = ["text-lantern", "text-twitter2", "text-sunset", "text-pastelred"] as const;

export function categoryIcon(category: string): IconSvgElement {
    return CATEGORY_ICONS[category.toLowerCase()] ?? Target02Icon;
}
export function categoryAccent(category: string): string {
    let h = 0;
    for (const c of category) h = (h * 31 + c.charCodeAt(0)) | 0;
    return ACCENTS[Math.abs(h) % ACCENTS.length];
}

export function CategoryEyebrow({ category }: { category: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.06]", categoryAccent(category))}>
                <HugeiconsIcon icon={categoryIcon(category)} className="size-4" strokeWidth={2} />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{category}</span>
        </div>
    );
}

/** The close-time line under a market title (Kalshi's "Jul 19 @ 10:00PM"). */
export function CloseLine({ market }: { market: Pick<MarketListItem, "status" | "closesAt"> }) {
    const closes = new Date(market.closesAt);
    if (market.status === "resolved") {
        return <p className="mt-1 text-[12.5px] font-semibold text-lantern">Resolved</p>;
    }
    if (market.status === "voided") {
        return <p className="mt-1 text-[12.5px] font-semibold text-zinc-500">Voided — refunds open</p>;
    }
    if (isPast(closes)) {
        return <p className="mt-1 text-[12.5px] font-semibold text-sunset">Awaiting result</p>;
    }
    const soon = differenceInHours(closes, new Date()) < 24;
    return (
        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-zinc-500">
            {soon && <span className="size-1.5 rounded-full bg-pastelred" />}
            {soon ? <span className="text-pastelred">Closes today</span> : "Closes"}{" "}
            {format(closes, "MMM d @ h:mmaa")}
        </p>
    );
}

/**
 * One outcome row, Kalshi anatomy: label over a probability underline;
 * payout multiple + percentage pill on the right.
 */
export function OutcomeRow({
    label,
    prob,
    multiple,
    rank,
    won,
    lost,
}: {
    label: string;
    prob: number;
    multiple: number | null;
    rank: number;
    won?: boolean;
    lost?: boolean;
}) {
    const barColor = won ? "bg-lantern" : lost ? "bg-white/15" : rank === 0 ? "bg-lantern" : "bg-twitter2";
    return (
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
                <p className={cn("truncate text-[14px] font-bold", won ? "text-lantern" : lost ? "text-zinc-500" : "text-zinc-100")}>
                    {label}
                    {won && <HugeiconsIcon icon={Tick02Icon} className="ml-1 inline size-3.5" strokeWidth={3} />}
                </p>
                <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div className={cn("h-full rounded-full", barColor)} style={{ width: `${Math.max(3, prob * 100)}%` }} />
                </div>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
                {multiple !== null && !won && !lost && (
                    <span className="text-[13px] font-semibold tabular-nums text-zinc-500">{fmtMultiple(multiple)}</span>
                )}
                <span
                    className={cn(
                        "rounded-full px-3 py-1 text-[13px] font-bold tabular-nums ring-1",
                        won
                            ? "bg-lantern text-black ring-lantern"
                            : lost
                                ? "text-zinc-600 ring-white/10"
                                : rank === 0
                                    ? "text-lantern ring-lantern/40"
                                    : "text-zinc-200 ring-white/15",
                    )}
                >
                    {Math.round(prob * 100)}%
                </span>
            </div>
        </div>
    );
}
