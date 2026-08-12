"use client";

// Is this coin's activity many people, or a few wallets passing tokens around?
//
// Sits beside CoinSecurityCard and deliberately does NOT live inside it: they
// answer different questions from different sources, and either can be present
// without the other. Mobula reports who HOLDS the supply; this reports who is
// TRADING it, from our own tape. They come apart exactly where it matters — a
// coin can show healthy holder distribution while five wallets manufacture all
// of its volume.
//
// Renders nothing without a verdict. `traderConcentration` needs 40+ recorded
// trades, and our tape only covers the coins the Helius budget can afford to
// watch (measured 2026-08-11: 18 tokens clear the floor over 24h, 52 over 7
// days). "We haven't seen enough trades" must never render as a reassuring row
// of zeroes — this is a money surface, and silence is the honest answer.

import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import type { CoinViewData } from "./coin-detail";
import { retryTransient } from "@/lib/query-retry";

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
        { address: coin.tokenAddress, days: 7 },
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
            <p className="mt-2 text-xs text-zinc-600">last {data.days} days, from trades we recorded</p>
        </div>
    );
}
