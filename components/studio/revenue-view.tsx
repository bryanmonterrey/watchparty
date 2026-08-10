"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { DollarCircleIcon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";

// Revenue (studio S6). Surfaces the claimable balance in-studio (the number
// creators check most) but keeps the claim + payout flow on the premium hub —
// don't duplicate payouts (premium-hub IA). USDC base units → dollars exactly
// as components/settings/payout-settings.tsx formats them (÷1_000_000).

const usd = (base: number | undefined) => `$${((base ?? 0) / 1_000_000).toFixed(2)}`;

export function RevenueView() {
  const claimable = trpc.subscription.getClaimable.useQuery();
  const feePct = ((claimable.data?.feeBps ?? 500) / 100).toFixed(0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Revenue</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your subscription earnings. You keep {100 - Number(feePct)}% — the {feePct}% is processing.
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
        <p className="text-xs text-muted-foreground">Available to claim</p>
        {claimable.isPending ? (
          <div className="mt-1 h-9 w-32 animate-pulse rounded-md bg-muted/40" />
        ) : claimable.error ? (
          <p className="mt-1 text-sm text-muted-foreground">{claimable.error.message}</p>
        ) : (
          <>
            <p className="mt-1 text-3xl font-semibold tabular-nums">{usd(claimable.data.netUsdc)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {usd(claimable.data.grossUsdc)} gross
              {claimable.data.feeUsdc > 0 ? ` · ${usd(claimable.data.feeUsdc)} fee (${feePct}%)` : ""}
            </p>
          </>
        )}
      </div>

      <a
        href="https://watchparty.xyz/premium?s=payouts"
        className="flex items-center gap-2.5 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:bg-accent/40 sm:p-5"
      >
        <div className="flex size-8 items-center justify-center rounded-lg border border-border/60">
          <HugeiconsIcon icon={DollarCircleIcon} className="size-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">Claim &amp; payout history</p>
          <p className="text-xs text-muted-foreground">
            Withdraw your balance, set up payouts, and see every earning on the premium hub.
          </p>
        </div>
        <HugeiconsIcon icon={LinkSquare02Icon} className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
      </a>
    </div>
  );
}
