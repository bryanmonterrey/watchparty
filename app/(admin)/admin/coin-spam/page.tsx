"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Squircle } from "@/components/ui/squircle";

/**
 * "What did the spam rules miss?" — the admin surface for
 * `lib/coin-feed/spam-review.ts`.
 *
 * Runs on a click, never on render: the review costs a Workers AI call and tens
 * of seconds, so it is a mutation rather than a query (no refetch-on-focus, no
 * retry).
 *
 * The page's whole job is keeping two outcomes visually apart. Coins the gate
 * ALREADY knows and admitted on liquidity are it working as designed — the
 * brand bar is a high bar, not a ban. Listing those beside genuine misses makes
 * a healthy run look like a dozen failures, and a report you learn to ignore is
 * worse than no report.
 */

const usd = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);

export default function CoinSpamPage() {
    const [hours, setHours] = useState(24);
    const review = trpc.admin.reviewCoinSpam.useMutation();
    const data = review.data;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-xl font-semibold">Coin spam review</h1>
                <p className="max-w-2xl text-sm text-flexwhite/60">
                    Reviews the coins the brand and security gates{" "}
                    <span className="text-flexwhite/90">accepted</span> — the rejects only measure the
                    gate. Proposals only: promoting a term is a code change to{" "}
                    <code className="text-flexwhite/80">lib/coin-feed/quality.ts</code>.
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-flexwhite/60">
                    Window
                    <select
                        value={hours}
                        onChange={(e) => setHours(Number(e.target.value))}
                        className="rounded-lg border border-flexborder/50 bg-black px-2 py-1.5 text-flexwhite"
                    >
                        <option value={1}>1 hour</option>
                        <option value={24}>24 hours</option>
                        <option value={72}>3 days</option>
                        <option value={168}>7 days</option>
                    </select>
                </label>
                <Squircle asChild radius={14}>
                    <button
                        onClick={() => review.mutate({ hours, limit: 80 })}
                        disabled={review.isPending}
                        className="h-11 bg-bleu px-5 text-sm font-medium text-white disabled:opacity-50"
                    >
                        {review.isPending ? "Reviewing…" : "Run review"}
                    </button>
                </Squircle>
            </div>

            {review.error && (
                <p className="text-sm text-red-400">{review.error.message}</p>
            )}

            {data && (
                <div className="flex flex-col gap-6">
                    <p className="text-sm text-flexwhite/60">
                        {data.total} coin(s) first seen in the last {hours}h — {data.rejectedByBar} already
                        rejected by the brand bar, {data.reviewed} reviewed.
                    </p>

                    <section className="flex flex-col gap-3">
                        <h2 className="text-sm font-semibold uppercase tracking-wide text-flexwhite/50">
                            The gate cannot see these ({data.invisible.length})
                        </h2>
                        {data.invisible.length === 0 ? (
                            <p className="text-sm text-flexwhite/40">Nothing — the rules caught everything flagged.</p>
                        ) : (
                            data.invisible.map((s) => (
                                <Squircle asChild key={`${s.candidate.network}:${s.candidate.tokenAddress}`} radius={16}>
                                    <div className="border border-flexborder/50 bg-flexwhite/[0.03] p-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-semibold">{s.candidate.symbol}</span>
                                            <span className="text-xs text-flexwhite/40">{s.candidate.network}</span>
                                            <span className="text-xs text-flexwhite/40">{s.confidence}</span>
                                            {s.belowBrandBar && (
                                                <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-300">
                                                    below the $250k bar — would be rejected outright
                                                </span>
                                            )}
                                        </div>
                                        {s.impersonates && (
                                            <p className="mt-1 text-sm text-flexwhite/80">
                                                impersonates {s.impersonates}
                                            </p>
                                        )}
                                        <p className="mt-1 text-sm text-flexwhite/60">{s.reason}</p>
                                        <p className="mt-2 text-xs text-flexwhite/40">
                                            liquidity {usd(s.candidate.liquidityUsd)} · {s.candidate.tokenAddress}
                                        </p>
                                    </div>
                                </Squircle>
                            ))
                        )}
                    </section>

                    {data.known.length > 0 && (
                        <section className="flex flex-col gap-2">
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-flexwhite/50">
                                Already recognised, admitted on liquidity ({data.known.length})
                            </h2>
                            <p className="text-sm text-flexwhite/40">
                                Working as designed — the brand bar is a high bar, not a ban.
                            </p>
                            <p className="text-sm text-flexwhite/70">
                                {data.known.map((s) => s.candidate.symbol).join(", ")}
                            </p>
                        </section>
                    )}

                    {(data.proposedTerms.length > 0 || data.proposedWords.length > 0) && (
                        <section className="flex flex-col gap-2">
                            <h2 className="text-sm font-semibold uppercase tracking-wide text-flexwhite/50">
                                Proposed additions to quality.ts
                            </h2>
                            {data.proposedTerms.length > 0 && (
                                <p className="text-sm">
                                    <span className="text-flexwhite/50">BRAND_TERMS (substring): </span>
                                    <code className="text-flexwhite/90">{data.proposedTerms.join(", ")}</code>
                                </p>
                            )}
                            {data.proposedWords.length > 0 && (
                                <p className="text-sm">
                                    <span className="text-flexwhite/50">BRAND_WORDS (word-boundary): </span>
                                    <code className="text-flexwhite/90">{data.proposedWords.join(", ")}</code>
                                </p>
                            )}
                            <p className="text-sm text-flexwhite/40">
                                Reject any that are ordinary words — a substring match on a common word fails
                                real coins, which is why COIN and META are absent by choice.
                            </p>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}
