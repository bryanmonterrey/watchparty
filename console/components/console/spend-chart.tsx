"use client";

import * as React from "react";
import { money } from "@/lib/format";

// 30-day daily-spend bars, hand-rolled (no chart lib — the template ships
// none and one series doesn't earn one). Dataviz rules applied: single hue
// (--chart-2, validated 3:1+ against both surfaces), thin marks with rounded
// data-ends and real gaps, recessive axis, per-bar hover tooltip, values in
// text tokens. Zero-spend days render as baseline only — zero is a value,
// not a missing bar.

export interface SpendPoint {
  day: string; // YYYY-MM-DD (UTC)
  spentUsd: number;
}

function utcDayString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The last `days` UTC days, oldest first, ending today. */
export function chartWindow(days = 30): string[] {
  const out: string[] = [];
  const now = Date.now();
  for (let i = days - 1; i >= 0; i--) {
    out.push(utcDayString(new Date(now - i * 86_400_000)));
  }
  return out;
}

function labelFor(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function SpendChart({ data, days = 30 }: { data: SpendPoint[]; days?: number }) {
  const window = React.useMemo(() => chartWindow(days), [days]);
  const byDay = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of data) m.set(p.day, (m.get(p.day) ?? 0) + p.spentUsd);
    return m;
  }, [data]);

  const series = window.map((day) => ({ day, spentUsd: byDay.get(day) ?? 0 }));
  const max = Math.max(...series.map((p) => p.spentUsd));
  const total = series.reduce((s, p) => s + p.spentUsd, 0);

  if (max <= 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm text-muted-foreground">No usage in the last {days} days</p>
        <p className="text-xs text-muted-foreground">
          Calls are metered per request and folded in hourly.
        </p>
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={`Daily API spend over the last ${days} days, totaling ${money(total)}. Peak day ${money(max)}.`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] text-muted-foreground tabular-nums">{money(max)} peak</span>
      </div>
      <div className="mt-1 border-t border-dashed border-border/60" />
      <div className="flex h-40 items-end gap-[3px] pt-2">
        {series.map((p) => (
          <div key={p.day} className="group relative flex h-full flex-1 items-end">
            {p.spentUsd > 0 ? (
              <div
                className="w-full rounded-t-[4px] bg-chart-2 transition-opacity group-hover:opacity-80"
                style={{ height: `${Math.max((p.spentUsd / max) * 100, 2)}%` }}
              />
            ) : (
              <div className="h-px w-full" />
            )}
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-[11px] shadow-sm group-hover:block">
              <span className="text-muted-foreground">{labelFor(p.day)}</span>{" "}
              <span className="font-medium tabular-nums">{money(p.spentUsd)}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t" />
      <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
        <span>{labelFor(window[0])}</span>
        <span>{labelFor(window[window.length - 1])}</span>
      </div>
    </div>
  );
}
