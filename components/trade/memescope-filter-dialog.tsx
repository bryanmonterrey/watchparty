"use client";

// Memescope's filter dialog — what the column headers' filter button opens.
// One filter set for the whole board (the three columns are one data set at
// three lifecycle stages; per-column filters would mean three drifting
// configs). Radix Dialog closes on outside click / escape.

import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * A ratio over a handful of trades is noise, not signal.
 *
 * `buyPercent` is a percentage, so a coin with one buy and no sells reads
 * **100%** — a perfect score for the emptiest possible token, and it would sit
 * at the top of any buy-pressure filter. Requiring a floor of real activity
 * before the ratio is allowed to mean anything is the whole difference between
 * this filter working and it surfacing dust.
 */
const MIN_TXNS_FOR_RATIO = 20;

/**
 * 24h volume over market cap — how many times the coin's whole value changed
 * hands today.
 *
 * Measured on the live watch list, the median is **21x**, ranging from single
 * digits to 50x+. That is an unusually discriminating number for something we
 * were storing and never ranking on: a $1.2M coin doing 40x is a different
 * animal from one doing 2x, and absolute volume cannot tell them apart because
 * it does not know how big the coin is.
 *
 * Null when there is no market cap to divide by — see volumeAcceleration for
 * why that is not 0 and not Infinity.
 */
export function turnover(t: { volume: number; marketCap: number }): number | null {
    if (!Number.isFinite(t.volume) || !Number.isFinite(t.marketCap) || t.marketCap <= 0) return null;
    return t.volume / t.marketCap;
}

/** Volume in the last 5 minutes, annualised to an hour, over actual 1h volume. */
export function volumeAcceleration(t: {
    volume5m: number | null;
    volume1h: number | null;
}): number | null {
    if (t.volume5m == null || t.volume1h == null || t.volume1h <= 0) return null;
    return (t.volume5m * 12) / t.volume1h;
}

export interface MemescopeFilters {
    minMarketCap: number | null;
    minVolume: number | null;
    minHolders: number | null;
    maxAgeHours: number | null;
    /** Drop rows flagged by the holder-quality thresholds (TradeToken.risky). */
    hideRisky: boolean;
    /**
     * Buy share of trades, 0-100. Accumulation rather than distribution — the
     * signal traders actually read off a pair. Only applied to coins with at
     * least MIN_TXNS_FOR_RATIO trades; below that the ratio is dust.
     */
    minBuyPercent: number | null;
    /**
     * Momentum: 1.0 means the last 5 minutes are running at exactly the hour's
     * pace, 2.0 means twice it. "$500 five minutes ago, $5,000 now" is the
     * thing people look for, and it beats absolute volume for finding a move
     * while it is still happening.
     */
    minVolumeAccel: number | null;
    /**
     * Minimum 24h volume / market cap. Size-relative activity, which is what
     * absolute volume can't express — the whole board's median is ~21x.
     */
    minTurnover: number | null;
}

export const NO_FILTERS: MemescopeFilters = {
    minMarketCap: null,
    minVolume: null,
    minHolders: null,
    maxAgeHours: null,
    hideRisky: false,
    minBuyPercent: null,
    minVolumeAccel: null,
    minTurnover: null,
};

/**
 * What the board STARTS with — not the same thing as `NO_FILTERS`.
 *
 * `NO_FILTERS` means literally none, and is what the dialog's clear button
 * applies; `filtersActive(NO_FILTERS)` must stay false and
 * `applyMemescopeFilters(list, NO_FILTERS)` must return the same array. Two
 * tests assert exactly that, and they caught this being conflated.
 *
 * The initial state is a different question, and the answer is measured: on
 * 2026-08-12 the live solana board carried `risky` on 22 of 97 coins (23%) and
 * showed every one, because the filter existed and started off. Photon and
 * Axiom both ship holder-concentration and dev/sniper filters active rather
 * than opt-in — a safety net that is off until you find the toggle protects
 * nobody.
 */
export const DEFAULT_FILTERS: MemescopeFilters = { ...NO_FILTERS, hideRisky: true };

export function filtersActive(f: MemescopeFilters): boolean {
    return (
        f.minMarketCap != null ||
        f.minVolume != null ||
        f.minHolders != null ||
        f.maxAgeHours != null ||
        f.minBuyPercent != null ||
        f.minVolumeAccel != null ||
        f.minTurnover != null ||
        f.hideRisky
    );
}

export function applyMemescopeFilters<
    T extends {
        marketCap: number;
        volume: number;
        holderCount: number;
        createdAtMs?: number | null;
        risky?: boolean;
        buyPercent?: number;
        txCount?: number;
        volume5m?: number | null;
        volume1h?: number | null;
    },
>(list: T[], f: MemescopeFilters): T[] {
    if (!filtersActive(f)) return list;
    const now = Date.now();
    return list.filter((t) => {
        if (f.hideRisky && t.risky) return false;
        if (f.minMarketCap != null && t.marketCap < f.minMarketCap) return false;
        if (f.minVolume != null && t.volume < f.minVolume) return false;
        if (f.minHolders != null && t.holderCount < f.minHolders) return false;
        if (f.maxAgeHours != null) {
            if (t.createdAtMs == null) return false;
            if (now - t.createdAtMs > f.maxAgeHours * 3_600_000) return false;
        }
        if (f.minBuyPercent != null) {
            // Unprovable is not the same as passing. Too few trades and the
            // percentage is an artefact of the sample size.
            if ((t.txCount ?? 0) < MIN_TXNS_FOR_RATIO) return false;
            if ((t.buyPercent ?? 0) < f.minBuyPercent) return false;
        }
        if (f.minVolumeAccel != null) {
            // Deliberately excludes coins with no 1h baseline, which mostly
            // means the very newest. "Accelerating" is a comparison, and
            // without a baseline there is nothing to compare to — letting them
            // through would make the filter mean "new OR accelerating", which
            // is not what the field says.
            const accel = volumeAcceleration({
                volume5m: t.volume5m ?? null,
                volume1h: t.volume1h ?? null,
            });
            if (accel == null || accel < f.minVolumeAccel) return false;
        }
        if (f.minTurnover != null) {
            // Same rule as acceleration: unknown is not a pass. A coin with no
            // market cap has no size to measure its volume against.
            const x = turnover(t);
            if (x == null || x < f.minTurnover) return false;
        }
        return true;
    });
}

function Field({
    label,
    value,
    onChange,
    placeholder,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
}) {
    return (
        <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-zinc-500">{label}</span>
            <input
                value={value}
                onChange={(e) => {
                    const v = e.target.value.replace(",", ".");
                    if (/^\d*\.?\d*$/.test(v)) onChange(v);
                }}
                inputMode="decimal"
                placeholder={placeholder}
                className="h-11 rounded-xl bg-white/5 px-3.5 text-[15px] font-semibold tabular-nums text-white outline-none placeholder:text-zinc-600"
            />
        </label>
    );
}

export function MemescopeFilterDialog({
    open,
    onOpenChange,
    filters,
    onApply,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    filters: MemescopeFilters;
    onApply: (f: MemescopeFilters) => void;
}) {
    // Drafted as strings so clearing a field doesn't fight number parsing;
    // re-seeded from the applied filters each time the dialog opens.
    const [marketCap, setMarketCap] = React.useState("");
    const [volume, setVolume] = React.useState("");
    const [holders, setHolders] = React.useState("");
    const [age, setAge] = React.useState("");
    const [buyPercent, setBuyPercent] = React.useState("");
    const [accel, setAccel] = React.useState("");
    const [turnoverMin, setTurnoverMin] = React.useState("");
    // Seeded from the applied filters, not hardcoded: the effect below re-seeds
    // on open so a literal was harmless today, but a literal `false` beside a
    // default of `true` is a contradiction waiting for someone to remove the
    // effect.
    const [hideRisky, setHideRisky] = React.useState(filters.hideRisky);
    React.useEffect(() => {
        if (!open) return;
        setMarketCap(filters.minMarketCap?.toString() ?? "");
        setVolume(filters.minVolume?.toString() ?? "");
        setHolders(filters.minHolders?.toString() ?? "");
        setAge(filters.maxAgeHours?.toString() ?? "");
        setBuyPercent(filters.minBuyPercent?.toString() ?? "");
        setAccel(filters.minVolumeAccel?.toString() ?? "");
        setTurnoverMin(filters.minTurnover?.toString() ?? "");
        setHideRisky(filters.hideRisky);
    }, [open, filters]);

    const parse = (v: string): number | null => {
        const n = Number(v);
        return v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogTitle>Filter coins</DialogTitle>
                <div className="mt-1 flex flex-col gap-3">
                    <Field label="Min market cap ($)" value={marketCap} onChange={setMarketCap} placeholder="10000" />
                    <Field label="Min 24h volume ($)" value={volume} onChange={setVolume} placeholder="5000" />
                    <Field label="Min holders" value={holders} onChange={setHolders} placeholder="50" />
                    <Field label="Max age (hours)" value={age} onChange={setAge} placeholder="24" />
                    <Field
                        label={`Min buy pressure (%) — needs ${MIN_TXNS_FOR_RATIO}+ trades`}
                        value={buyPercent}
                        onChange={setBuyPercent}
                        placeholder="60"
                    />
                    <Field
                        label="Min volume acceleration (5m vs 1h pace)"
                        value={accel}
                        onChange={setAccel}
                        placeholder="2"
                    />
                    <Field
                        label="Min turnover (24h volume ÷ market cap)"
                        value={turnoverMin}
                        onChange={setTurnoverMin}
                        placeholder="10"
                    />
                    <button
                        type="button"
                        onClick={() => setHideRisky((v) => !v)}
                        className="flex cursor-pointer items-center justify-between py-1 text-left"
                    >
                        <span className="flex flex-col">
                            <span className="text-[13px] font-medium text-zinc-300">Hide risky coins</span>
                            <span className="text-[12px] text-zinc-600">
                                High sniper / insider / top-10 holder concentration
                            </span>
                        </span>
                        <span
                            className={
                                "flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors " +
                                (hideRisky ? "bg-lantern justify-end" : "bg-white/10 justify-start")
                            }
                        >
                            <span className="size-5 rounded-full bg-white" />
                        </span>
                    </button>
                </div>
                <div className="mt-4 flex items-center gap-2">
                    <Button
                        onClick={() => {
                            onApply(NO_FILTERS);
                            onOpenChange(false);
                        }}
                        className="h-11 flex-1 rounded-full bg-white/10 font-bold text-white hover:bg-white/20"
                    >
                        Reset
                    </Button>
                    <Button
                        onClick={() => {
                            onApply({
                                minMarketCap: parse(marketCap),
                                minVolume: parse(volume),
                                minHolders: parse(holders),
                                maxAgeHours: parse(age),
                                minBuyPercent: parse(buyPercent),
                                minVolumeAccel: parse(accel),
                                minTurnover: parse(turnoverMin),
                                hideRisky,
                            });
                            onOpenChange(false);
                        }}
                        className="h-11 flex-1 rounded-full bg-white font-bold text-black hover:bg-white/85"
                    >
                        Apply
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
