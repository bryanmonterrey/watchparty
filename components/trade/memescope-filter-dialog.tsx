"use client";

// Memescope's filter dialog — what the column headers' filter button opens.
// One filter set for the whole board (the three columns are one data set at
// three lifecycle stages; per-column filters would mean three drifting
// configs). Radix Dialog closes on outside click / escape.

import * as React from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface MemescopeFilters {
    minMarketCap: number | null;
    minVolume: number | null;
    minHolders: number | null;
    maxAgeHours: number | null;
    /** Drop rows flagged by the holder-quality thresholds (TradeToken.risky). */
    hideRisky: boolean;
}

export const NO_FILTERS: MemescopeFilters = {
    minMarketCap: null,
    minVolume: null,
    minHolders: null,
    maxAgeHours: null,
    hideRisky: false,
};

export function filtersActive(f: MemescopeFilters): boolean {
    return (
        f.minMarketCap != null ||
        f.minVolume != null ||
        f.minHolders != null ||
        f.maxAgeHours != null ||
        f.hideRisky
    );
}

export function applyMemescopeFilters<
    T extends { marketCap: number; volume: number; holderCount: number; createdAtMs?: number | null; risky?: boolean },
>(list: T[], f: MemescopeFilters): T[] {
    if (!filtersActive(f)) return list;
    const now = Date.now();
    return list.filter(
        (t) =>
            (!f.hideRisky || !t.risky) &&
            (f.minMarketCap == null || t.marketCap >= f.minMarketCap) &&
            (f.minVolume == null || t.volume >= f.minVolume) &&
            (f.minHolders == null || t.holderCount >= f.minHolders) &&
            (f.maxAgeHours == null ||
                (t.createdAtMs != null && now - t.createdAtMs <= f.maxAgeHours * 3_600_000)),
    );
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
    const [hideRisky, setHideRisky] = React.useState(false);
    React.useEffect(() => {
        if (!open) return;
        setMarketCap(filters.minMarketCap?.toString() ?? "");
        setVolume(filters.minVolume?.toString() ?? "");
        setHolders(filters.minHolders?.toString() ?? "");
        setAge(filters.maxAgeHours?.toString() ?? "");
        setHideRisky(filters.hideRisky);
    }, [open, filters]);

    const parse = (v: string): number | null => {
        const n = Number(v);
        return v.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogTitle>filter coins</DialogTitle>
                <div className="mt-1 flex flex-col gap-3">
                    <Field label="min market cap ($)" value={marketCap} onChange={setMarketCap} placeholder="10000" />
                    <Field label="min 24h volume ($)" value={volume} onChange={setVolume} placeholder="5000" />
                    <Field label="min holders" value={holders} onChange={setHolders} placeholder="50" />
                    <Field label="max age (hours)" value={age} onChange={setAge} placeholder="24" />
                    <button
                        type="button"
                        onClick={() => setHideRisky((v) => !v)}
                        className="flex cursor-pointer items-center justify-between py-1 text-left"
                    >
                        <span className="flex flex-col">
                            <span className="text-[13px] font-medium text-zinc-300">hide risky coins</span>
                            <span className="text-[12px] text-zinc-600">
                                high sniper / insider / top-10 holder concentration
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
                        reset
                    </Button>
                    <Button
                        onClick={() => {
                            onApply({
                                minMarketCap: parse(marketCap),
                                minVolume: parse(volume),
                                minHolders: parse(holders),
                                maxAgeHours: parse(age),
                                hideRisky,
                            });
                            onOpenChange(false);
                        }}
                        className="h-11 flex-1 rounded-full bg-white font-bold text-black hover:bg-white/85"
                    >
                        apply
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
