"use client";

import { useState } from "react";
import { RangeSlider } from "@/components/motion/range-slider";
import { compactCount } from "@/lib/utils";

// The X-developer-page "credit consumption" pattern: rows of resources with a
// usage slider each and a live estimated monthly total. Ours is honest about
// the model — every billed request costs the same flat price today — so the
// rows are API surfaces, not a fake per-endpoint price sheet.

const PRICE_USD = 0.001;

const SURFACES = [
    { key: "data", name: "Data API", desc: "Coins, streams, feeds, and markets over tRPC." },
    { key: "rpc", name: "RPC proxy", desc: "Solana RPC without running your own node." },
    { key: "charts", name: "Chart data", desc: "Candles and history in TradingView UDF shape." },
    { key: "rest", name: "Everything else", desc: "Any other billed endpoint, same flat price." },
] as const;

const MAX = 1_000_000;
const STEP = 10_000;

function money(usd: number): string {
    return usd >= 100 ? `$${Math.round(usd).toLocaleString()}` : `$${usd.toFixed(2)}`;
}

export function PricingCalculator() {
    const [usage, setUsage] = useState<Record<string, number>>({ data: 250_000, rpc: 100_000, charts: 50_000, rest: 0 });
    const totalReq = Object.values(usage).reduce((a, b) => a + b, 0);
    const totalUsd = totalReq * PRICE_USD;

    return (
        // The slider primitive is built on theme tokens, and this page is a
        // hardcoded-light shell — pin the tokens it reads so a dark app theme
        // can't paint a white thumb on the white card.
        <div
            className="overflow-hidden rounded-[32px] bg-white ring-1 ring-black/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
            style={{ "--color-muted": "rgba(0,0,0,0.06)", "--color-foreground": "#000" } as React.CSSProperties}
        >
            <div className="divide-y divide-black/[0.06]">
                {SURFACES.map((s) => {
                    const req = usage[s.key] ?? 0;
                    return (
                        <div key={s.key} className="grid gap-4 p-6 sm:grid-cols-[minmax(0,1fr)_minmax(200px,320px)] sm:items-center sm:gap-8 sm:p-8">
                            <div>
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                    <p className="text-lg font-extrabold tracking-tight text-black">{s.name}</p>
                                    <p className="font-mono text-[13px] font-semibold text-black/45">$0.001 / request</p>
                                </div>
                                <p className="mt-1 text-[15px] font-semibold leading-snug text-black/55">{s.desc}</p>
                            </div>
                            <div>
                                <div className="mb-2 flex items-baseline justify-between font-mono text-[13px] font-semibold">
                                    <span className="text-black/45">{compactCount(req)} requests</span>
                                    <span className="text-black">{money(req * PRICE_USD)}</span>
                                </div>
                                <RangeSlider
                                    value={req}
                                    onValueChange={(v) => setUsage((u) => ({ ...u, [s.key]: v }))}
                                    min={0}
                                    max={MAX}
                                    step={STEP}
                                    showTicks={false}
                                    aria-label={`${s.name} monthly requests`}
                                    formatValueText={(v) => `${compactCount(v)} requests`}
                                    className="h-11 rounded-full"
                                />
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-col gap-2 bg-black p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
                <div>
                    <p className="text-sm font-bold text-white/55">Estimated monthly total</p>
                    <p className="mt-1 font-mono text-[13px] font-semibold text-white/40">
                        {compactCount(totalReq)} requests · billed from your credit balance
                    </p>
                </div>
                <p className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{money(totalUsd)}</p>
            </div>
        </div>
    );
}
