"use client";

import { useState } from "react";
import { RangeSlider } from "@/components/motion/range-slider";
import { compactCount } from "@/lib/utils";
import { PRICE_SHEET } from "@/lib/api-pricing";

// The X-developer-console "credit consumption" table: one row per resource
// with its unit cost, a usage slider, and a live estimated monthly total.
// Rows and prices come from lib/api-pricing.ts — the same module the gate
// charges from, so this table can't drift from what's actually billed.

const DEFAULT_USAGE: Record<string, number> = {
    coins: 250_000,
    content: 100_000,
    social: 20_000,
    charts: 50_000,
    rpc: 100_000,
    preview: 0,
    rest: 0,
};

const MAX = 500_000;
const STEP = 5_000;

function money(usd: number): string {
    return usd >= 100 ? `$${Math.round(usd).toLocaleString()}` : `$${usd.toFixed(2)}`;
}

function unit(usd: number): string {
    return `$${usd.toFixed(3)}`;
}

export function PricingCalculator() {
    const [usage, setUsage] = useState<Record<string, number>>(DEFAULT_USAGE);
    const totalReq = PRICE_SHEET.reduce((a, r) => a + (usage[r.key] ?? 0), 0);
    const totalUsd = PRICE_SHEET.reduce((a, r) => a + (usage[r.key] ?? 0) * r.usd, 0);

    return (
        // The slider primitive is built on theme tokens, and this page is a
        // hardcoded-light shell — pin the tokens it reads so a dark app theme
        // can't paint a white thumb on the white card.
        <div
            className="overflow-hidden rounded-[32px] bg-white ring-1 ring-black/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
            style={{ "--color-muted": "rgba(0,0,0,0.06)", "--color-foreground": "#000" } as React.CSSProperties}
        >
            <div className="hidden grid-cols-[minmax(0,1fr)_minmax(200px,320px)] gap-8 border-b border-black/[0.06] px-8 py-4 sm:grid">
                <p className="text-[13px] font-bold uppercase tracking-wide text-black/40">Resource · unit cost</p>
                <p className="text-[13px] font-bold uppercase tracking-wide text-black/40">Estimated usage per month</p>
            </div>
            <div className="divide-y divide-black/[0.06]">
                {PRICE_SHEET.map((row) => {
                    const req = usage[row.key] ?? 0;
                    return (
                        <div key={row.key} className="grid gap-4 p-6 sm:grid-cols-[minmax(0,1fr)_minmax(200px,320px)] sm:items-center sm:gap-8 sm:p-8">
                            <div>
                                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                    <p className="text-lg font-extrabold tracking-tight text-black">{row.name}</p>
                                    <p className="font-mono text-[13px] font-semibold text-black/45">{unit(row.usd)} / each</p>
                                </div>
                                <p className="mt-1 text-[15px] font-semibold leading-snug text-black/55">{row.desc}</p>
                            </div>
                            <div>
                                <div className="mb-2 flex items-baseline justify-between font-mono text-[13px] font-semibold">
                                    <span className="text-black/45">{compactCount(req)} calls</span>
                                    <span className="text-black">{money(req * row.usd)}</span>
                                </div>
                                <RangeSlider
                                    value={req}
                                    onValueChange={(v) => setUsage((u) => ({ ...u, [row.key]: v }))}
                                    min={0}
                                    max={MAX}
                                    step={STEP}
                                    showTicks={false}
                                    aria-label={`${row.name} monthly calls`}
                                    formatValueText={(v) => `${compactCount(v)} calls`}
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
                        {compactCount(totalReq)} calls · billed from your credit balance · rejections free
                    </p>
                </div>
                <p className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{money(totalUsd)}</p>
            </div>
        </div>
    );
}
