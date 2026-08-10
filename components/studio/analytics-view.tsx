"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Analytics01Icon, LinkSquare02Icon, FavouriteIcon, ViewIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";

// Native studio analytics (S5) — real numbers from user.getAnalytics
// (followers, lifetime views/likes/posts, top posts). No fabricated charts;
// the time-series engagement history + per-stream summary are the next slice.
// The premium hub still holds the deeper charts, linked at the bottom.

function fmt(n: number | undefined): string {
  if (n === undefined) return "—";
  return new Intl.NumberFormat(undefined, { notation: n >= 10_000 ? "compact" : "standard" }).format(n);
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function AnalyticsView() {
  const a = trpc.user.getAnalytics.useQuery();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          How your channel and content are performing.
        </p>
      </div>

      {a.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted/30" />
          ))}
        </div>
      ) : a.error ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4 text-sm text-muted-foreground">
          {a.error.message}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Followers" value={fmt(a.data.followers)} />
            <StatTile label="Total views" value={fmt(a.data.totalViews)} />
            <StatTile label="Total likes" value={fmt(a.data.totalLikes)} />
            <StatTile label="Published posts" value={fmt(a.data.totalPosts)} />
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
            <p className="text-sm font-medium">Top posts</p>
            <div className="mt-2 flex flex-col divide-y">
              {a.data.topPosts.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No published posts yet.
                </p>
              ) : (
                a.data.topPosts.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 py-2.5">
                    <p className="min-w-0 flex-1 truncate text-sm">
                      {(p.content ?? "").trim() || "Untitled"}
                    </p>
                    <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      <HugeiconsIcon icon={ViewIcon} className="size-3" />
                      {fmt(p.views)}
                    </span>
                    <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      <HugeiconsIcon icon={FavouriteIcon} className="size-3" />
                      {fmt(p.likes)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      <a
        href="https://watchparty.xyz/premium?s=analytics"
        className="flex items-center gap-2.5 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:bg-accent/40"
      >
        <div className="flex size-8 items-center justify-center rounded-lg border border-border/60">
          <HugeiconsIcon icon={Analytics01Icon} className="size-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">Deeper charts</p>
          <p className="text-xs text-muted-foreground">Engagement over time, on the premium hub</p>
        </div>
        <HugeiconsIcon icon={LinkSquare02Icon} className="ml-auto size-3.5 text-muted-foreground" />
      </a>
    </div>
  );
}
