"use client";

// Is this coin's activity many people, or a few wallets passing tokens around?
//
// Sits beside CoinSecurityCard and deliberately does NOT live inside it: they
// answer different questions, and either can be present without the other.
// Security reports who HOLDS the supply; this reports who is TRADING it. They
// come apart exactly where it matters — a coin can show healthy holder
// distribution while five wallets manufacture all of its volume.
//
// Scored over up to the last 1,000 SWAPS from Mobula (fewer on EVM chains,
// where most of a page is liquidity operations), not over our own tape. The
// tape is filled by the Helius trades webhook, whose budget could afford two or
// three coins, so this card used to render on almost nothing (measured
// 2026-08-11: 18 tokens cleared the 40-trade floor over 24h, out of a board of
// ~200). It now renders on any coin anyone opens.
//
// Still renders nothing without a verdict: "we haven't seen enough trades" must
// never appear as a reassuring row of zeroes — this is a money surface, and
// silence is the honest answer.

import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import type { CoinViewData } from "./coin-detail";
import { retryTransient } from "@/lib/query-retry";

/** Minutes → the coarsest unit that stays truthful. */
function formatSpan(minutes: number): string {
    if (minutes < 60) return `${minutes} min`;
    const hours = minutes / 60;
    if (hours < 48) return `${hours < 10 ? hours.toFixed(1) : Math.round(hours)} hours`;
    return `${Math.round(hours / 24)} days`;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
    return (
        <div className="flex items-center justify-between py-1.5">
            <span className="text-sm font-medium text-zinc-500">{label}</span>
            <span
                className={cn(
                    "text-sm font-bold tabular-nums",
                    tone === "good" ? "text-lantern" : tone === "bad" ? "text-pastelred" : "text-zinc-200",
                )}
            >
                {value}
            </span>
        </div>
    );
}

export function CoinActivityCard({ coin, cardClassName }: { coin: CoinViewData; cardClassName: string }) {
    const { data } = trpc.trade.coinTraderConcentration.useQuery(
        { address: coin.tokenAddress, network: coin.network },
        { staleTime: 300_000, retry: retryTransient(1) },
    );
    if (!data) return null;

    return (
        <div className={cn(cardClassName, "mt-2 p-4")}>
            <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white">trader activity</h3>
                {data.washy && (
                    <span className="rounded-full bg-pastelred/15 px-2 py-0.5 text-xs font-bold text-pastelred">
                        concentrated
                    </span>
                )}
            </div>
            <div className="mt-1.5">
                {/* The two axes are not redundant — measured on the live board,
                    one token was flagged only by top-5 share and another only by
                    round-trips, which is why the verdict is an OR. */}
                <Row
                    label="top 5 wallets"
                    value={`${data.top5SharePct.toFixed(1)}%`}
                    tone={data.top5SharePct >= 60 ? "bad" : undefined}
                />
                <Row
                    label="round-trip traders"
                    value={`${data.roundTripPct.toFixed(1)}%`}
                    tone={data.roundTripPct >= 40 ? "bad" : undefined}
                />
                {/* REPORTED, never judged. Top-5 share by VOLUME runs a median
                    +35 points above the same token's share by count and sits at
                    60-100% for nearly everything, because a few wallets move
                    most of the dollars in ANY market. Colouring it would mark
                    almost every coin washy. */}
                {data.top5VolumeSharePct != null && (
                    <Row label="top 5 by volume" value={`${data.top5VolumeSharePct.toFixed(1)}%`} />
                )}
                <Row label="traders" value={`${data.traders} / ${data.trades} trades`} />
            </div>
            {/* Says the span it MEASURED, not a window it was configured with.
                The source returns the last N trades, so the period varies by how
                busy the coin is — 18 minutes on BONK, 138 on BRETT. Printing a
                fixed "last 7 days" here would have been a straight lie about a
                number sitting next to a wash-trading verdict. */}
            <p className="mt-2 text-xs text-zinc-600">
                last {data.trades.toLocaleString()} trades
                {data.windowMinutes != null && `, about ${formatSpan(data.windowMinutes)}`}
            </p>
        </div>
    );
}
