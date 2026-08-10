"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { money } from "@/lib/format";
import { SpendChart, chartWindow } from "@/components/console/spend-chart";
import { PRICE_SHEET } from "@/lib/price-sheet";

function windowLabel(): string {
  const w = chartWindow();
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  return `${fmt(w[0])} – ${fmt(w[w.length - 1])} (UTC)`;
}

export function UsageView() {
  const usage = trpc.apiKeys.usageSeries.useQuery();

  const total = (usage.data ?? []).reduce((s, r) => s + r.spentUsd, 0);
  const byKey = new Map<string, { name: string; spentUsd: number }>();
  for (const r of usage.data ?? []) {
    const cur = byKey.get(r.keyId);
    if (cur) cur.spentUsd += r.spentUsd;
    else byKey.set(r.keyId, { name: r.keyName, spentUsd: r.spentUsd });
  }
  const keyRows = [...byKey.values()].sort((a, b) => b.spentUsd - a.spentUsd);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">Usage</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Showing data from {windowLabel()} · spend is folded in hourly
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <p className="text-xs text-muted-foreground">Total cost</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{money(total)}</p>
        <div className="mt-4">
          {usage.isPending ? (
            <Skeleton className="h-48 rounded-lg" />
          ) : usage.error ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {usage.error.message}
            </p>
          ) : (
            <SpendChart data={usage.data} />
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <p className="text-sm font-medium">By key</p>
          <div className="mt-3 flex flex-col gap-2">
            {usage.isPending ? (
              <>
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
              </>
            ) : keyRows.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No spend in this window.
              </p>
            ) : (
              keyRows.map((k, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm">{k.name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {money(k.spentUsd)}
                      </p>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-chart-2"
                        style={{ width: `${total > 0 ? (k.spentUsd / total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Price sheet</p>
            <p className="text-xs text-muted-foreground">per call</p>
          </div>
          <div className="mt-3 flex flex-col divide-y">
            {PRICE_SHEET.map((row) => (
              <div key={row.key} className="flex items-start justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm">{row.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{row.desc}</p>
                </div>
                <p className="shrink-0 text-sm tabular-nums">${row.usd}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
