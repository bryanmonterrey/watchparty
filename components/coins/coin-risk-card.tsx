"use client";

// One card for "should I trust this coin": who HOLDS the supply, what the
// CONTRACT can still do, and who is TRADING it.
//
// This merges what used to be CoinSecurityCard and CoinActivityCard. Those were
// deliberately separate, and the reason is worth keeping in view rather than
// deleting with them: they answer different questions from different sources,
// and either can be present without the other. A coin can show healthy holder
// distribution while five wallets manufacture all of its volume.
//
// So this is a merge of the CHROME, not of the data. Two queries, two sections,
// each rendering only when its own source answered — and the card itself
// renders nothing when neither did. What it buys is one outline and one heading
// in the swap column instead of two stacked boxes that were usually both
// half-empty.
//
// Both halves still refuse to invent a verdict. Security shows only the rows the
// API returned; "we haven't seen enough trades" must never appear as a
// reassuring row of zeroes, because this is a money surface and silence is the
// honest answer.

import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import type { CoinViewData } from "./coin-detail";
import { retryTransient } from "@/lib/query-retry";

function pct(v: number | null): string {
    if (v == null) return "—";
    if (v > 0 && v < 0.1) return "<0.1%";
    return `${v.toFixed(1)}%`;
}

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
            <span className="text-13 font-medium text-zinc-500">{label}</span>
            <span
                className={cn(
                    "text-13 font-semibold tabular-nums",
                    tone === "good" ? "text-lantern" : tone === "bad" ? "text-pastelred" : "text-zinc-200",
                )}
            >
                {value}
            </span>
        </div>
    );
}

export function CoinRiskCard({
    coin,
    cardClassName,
    enabled = true,
}: {
    coin: CoinViewData;
    cardClassName: string;
    /** Off for a draft, whose `tokenAddress` is a row id no upstream has heard of. */
    enabled?: boolean;
}) {
    const { data: security } = trpc.trade.coinSecurity.useQuery(
        { network: coin.network, address: coin.tokenAddress },
        { staleTime: 120_000, retry: retryTransient(1), enabled },
    );
    const { data: activity } = trpc.trade.coinTraderConcentration.useQuery(
        { address: coin.tokenAddress, network: coin.network },
        { staleTime: 300_000, retry: retryTransient(1), enabled },
    );

    // Percent rows: only the ones with an answer. Counts ride in the label.
    const holdings: { label: string; value: number | null; warnAt: number }[] = security
        ? [
              { label: "Top 10 holders", value: security.top10Pct, warnAt: 30 },
              {
                  label: security.snipersCount ? `Snipers (${security.snipersCount})` : "Snipers",
                  value: security.snipersPct,
                  warnAt: 10,
              },
              {
                  label: security.insidersCount ? `Insiders (${security.insidersCount})` : "Insiders",
                  value: security.insidersPct,
                  warnAt: 10,
              },
              {
                  label: security.bundlersCount ? `Bundlers (${security.bundlersCount})` : "Bundlers",
                  value: security.bundlersPct,
                  warnAt: 10,
              },
              { label: "Dev holdings", value: security.devPct, warnAt: 5 },
          ]
        : [];
    const shown = holdings.filter((h) => h.value != null);

    const flags: { label: string; value: string; tone: "good" | "bad" }[] = [];
    if (security?.noMintAuthority != null) {
        flags.push(
            security.noMintAuthority
                ? { label: "Mint authority", value: "Revoked", tone: "good" }
                : { label: "Mint authority", value: "Active", tone: "bad" },
        );
    }
    if (security?.isFreezable != null) {
        flags.push(
            security.isFreezable
                ? { label: "Freezable", value: "Yes", tone: "bad" }
                : { label: "Freezable", value: "No", tone: "good" },
        );
    }
    if (security?.buyTaxPct != null) flags.push({ label: "Buy tax", value: `${security.buyTaxPct}%`, tone: "bad" });
    if (security?.sellTaxPct != null) flags.push({ label: "Sell tax", value: `${security.sellTaxPct}%`, tone: "bad" });
    if (security?.honeypotFlag) flags.push({ label: "Blacklist", value: "Flagged", tone: "bad" });

    const hasHolders = shown.length > 0 || flags.length > 0;
    const hasTraders = !!activity;
    if (!hasHolders && !hasTraders) return null;

    return (
        <div className={cn(cardClassName, "mt-2 p-4")}>
            <div className="flex items-center justify-between">
                <h3 className="text-15 font-semibold text-flexwhite">Security</h3>
                {security?.securityScore != null && (
                    <span
                        className={cn(
                            "text-13 font-semibold tabular-nums",
                            security.securityScore >= 70
                                ? "text-lantern"
                                : security.securityScore >= 40
                                  ? "text-zinc-300"
                                  : "text-pastelred",
                        )}
                    >
                        {Math.round(security.securityScore)}/100
                    </span>
                )}
            </div>

            {hasHolders && (
                <div className="mt-1.5">
                    {shown.map((h) => (
                        <Row
                            key={h.label}
                            label={h.label}
                            value={pct(h.value)}
                            tone={(h.value ?? 0) >= h.warnAt ? "bad" : undefined}
                        />
                    ))}
                    {flags.map((f) => (
                        <Row key={f.label} label={f.label} value={f.value} tone={f.tone} />
                    ))}
                </div>
            )}

            {activity && (
                // The hairline only exists when there is something above it to
                // divide — with holders missing, traders IS the card.
                <div className={cn(hasHolders && "mt-3 border-t border-border pt-3")}>
                    <div className="flex items-center justify-between">
                        <h4 className="text-13 font-semibold text-zinc-300">Traders</h4>
                        {activity.washy && (
                            <span className="rounded-full bg-pastelred/15 px-2 py-0.5 text-xs font-semibold text-pastelred">
                                Concentrated
                            </span>
                        )}
                    </div>
                    <div className="mt-1">
                        {/* The two axes are not redundant — measured on the live
                            board, one token was flagged only by top-5 share and
                            another only by round-trips, which is why the verdict
                            is an OR. */}
                        <Row
                            label="Top 5 wallets"
                            value={`${activity.top5SharePct.toFixed(1)}%`}
                            tone={activity.top5SharePct >= 60 ? "bad" : undefined}
                        />
                        <Row
                            label="Round-trip traders"
                            value={`${activity.roundTripPct.toFixed(1)}%`}
                            tone={activity.roundTripPct >= 40 ? "bad" : undefined}
                        />
                        {/* REPORTED, never judged. Top-5 share by VOLUME runs a
                            median +35 points above the same token's share by
                            count and sits at 60-100% for nearly everything,
                            because a few wallets move most of the dollars in ANY
                            market. Colouring it would mark almost every coin
                            washy. */}
                        {activity.top5VolumeSharePct != null && (
                            <Row label="Top 5 by volume" value={`${activity.top5VolumeSharePct.toFixed(1)}%`} />
                        )}
                        <Row label="Traders" value={`${activity.traders} / ${activity.trades} trades`} />
                    </div>
                    {/* Says the span it MEASURED, not a window it was configured
                        with. The source returns the last N trades, so the period
                        varies by how busy the coin is — 18 minutes on BONK, 138
                        on BRETT. Printing a fixed "last 7 days" here would have
                        been a straight lie about a number sitting next to a
                        wash-trading verdict. */}
                    <p className="mt-2 text-xs text-zinc-600">
                        Last {activity.trades.toLocaleString()} trades
                        {activity.windowMinutes != null && `, about ${formatSpan(activity.windowMinutes)}`}
                    </p>
                </div>
            )}
        </div>
    );
}
