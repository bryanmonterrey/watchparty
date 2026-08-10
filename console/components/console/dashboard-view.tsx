"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HugeiconsIcon } from "@hugeicons/react";
import { Key01Icon, Cancel01Icon, ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/session";
import { money } from "@/lib/format";
import { SpendChart } from "@/components/console/spend-chart";
import { Chip } from "@/components/console/chip";

const BANNER_KEY = "console-x402-banner-dismissed";

function X402Banner() {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    if (!localStorage.getItem(BANNER_KEY)) setVisible(true);
  }, []);
  if (!visible) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-card p-4">
      <div className="flex-1 text-sm">
        <span className="font-medium">Building an agent?</span>{" "}
        <span className="text-muted-foreground">
          The API is x402-native — agents can pay per request on-chain with no
          key and no account at all.
        </span>{" "}
        <a
          href="https://docs.watchparty.xyz"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline underline-offset-2"
        >
          Read how
        </a>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss"
        onClick={() => {
          localStorage.setItem(BANNER_KEY, "1");
          setVisible(false);
        }}
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
      </Button>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function DashboardView() {
  const { data: session } = useSession();
  const keys = trpc.apiKeys.list.useQuery();
  const usage = trpc.apiKeys.usageSeries.useQuery();

  const firstName = session?.user?.name?.split(" ")[0];
  const active = (keys.data ?? []).filter((k) => !k.revoked);
  const totalBalance = active.reduce((s, k) => s + k.balanceUsd, 0);
  const totalSpent = (keys.data ?? []).reduce((s, k) => s + k.spentUsd, 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <X402Banner />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Hello{firstName ? `, ${firstName}` : ""}</h2>
        <Button render={<Link href="/credits" />}>Buy credits</Button>
      </div>

      {keys.isPending ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      ) : keys.error ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {keys.error.message}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            label="Total balance"
            value={money(totalBalance)}
            hint="Across active keys"
          />
          <StatCard label="Total spent" value={money(totalSpent)} hint="All time" />
          <StatCard
            label="Active keys"
            value={String(active.length)}
            hint={active.length >= 10 ? "At the 10-key limit" : undefined}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">Usage cost</p>
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </div>
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

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Keys</p>
              <Link
                href="/keys"
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Manage keys
              </Link>
            </div>
            <div className="mt-3 flex flex-col gap-1">
              {keys.isPending ? (
                <>
                  <Skeleton className="h-12 rounded-lg" />
                  <Skeleton className="h-12 rounded-lg" />
                </>
              ) : active.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <div className="flex size-9 items-center justify-center rounded-lg border">
                    <HugeiconsIcon icon={Key01Icon} className="size-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    No keys yet — create one and you&apos;re calling the API in
                    minutes.
                  </p>
                  <Button size="sm" variant="outline" render={<Link href="/keys" />}>
                    Create a key
                  </Button>
                </div>
              ) : (
                active.slice(0, 5).map((k) => (
                  <Link
                    key={k.id}
                    href="/keys"
                    className="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent/50"
                  >
                    <div className="flex size-8 items-center justify-center rounded-lg border">
                      <HugeiconsIcon icon={Key01Icon} className="size-3.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{k.name}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">{k.prefix}</p>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {money(k.balanceUsd)}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm font-medium">Get started</p>
            <p className="mt-1 text-xs text-muted-foreground">
              One header — <span className="font-mono">x-api-key</span> — against
              the live app&apos;s streams, coins, and markets. From $0.001 a
              call.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full gap-1.5"
              render={
                <a href="https://docs.watchparty.xyz" target="_blank" rel="noopener noreferrer" />
              }
            >
              Read the docs
              <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
