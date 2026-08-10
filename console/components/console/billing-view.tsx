"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { CopyButton } from "@/components/console/copy-button";
import { Chip } from "@/components/console/chip";

// The X page this maps to shows saved cards; watchparty has none — funding is
// USDC on Solana (docs/console-x-reference.md §14). So this page is the
// canonical record of HOW the account is funded: deposit details + the flow.

const STEPS = [
  {
    title: "Send USDC on Solana",
    body: "From any wallet, to the deposit address. No in-console wallet needed.",
  },
  {
    title: "Redeem the transaction signature",
    body: "Paste it on the Credits page and choose which key to credit.",
  },
  {
    title: "Credits post after on-chain verification",
    body: "1 credit = $1, held as USDC. Underpaid claims are rejected.",
  },
];

export function BillingView() {
  const info = trpc.apiKeys.depositInfo.useQuery();

  const rows = info.data
    ? [
        { label: "Deposit address", value: info.data.address, copy: true },
        { label: "Network", value: "Solana", copy: false },
        { label: "Token (USDC mint)", value: info.data.mint, copy: true },
        { label: "Minimum deposit", value: `$${info.data.minUsd}`, copy: false },
      ]
    : [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">Billing information</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          How your account is funded — credits are prepaid USDC on Solana.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">Payment method</p>
          <Chip tone="good">Active</Chip>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          No cards on file — deposits are on-chain transfers to the address
          below, from any wallet you control.
        </p>

        <div className="mt-4 flex flex-col divide-y">
          {info.isPending ? (
            <>
              <Skeleton className="my-1 h-10 rounded-lg" />
              <Skeleton className="my-1 h-10 rounded-lg" />
            </>
          ) : info.error ? (
            <p className="py-6 text-center text-xs text-destructive">
              {info.error.message}
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <p className="shrink-0 text-xs text-muted-foreground">{row.label}</p>
                <div className="flex min-w-0 items-center gap-1">
                  <p className="min-w-0 truncate text-right font-mono text-xs">
                    {row.value}
                  </p>
                  {row.copy ? <CopyButton value={row.value} /> : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <p className="text-sm font-medium">How funding works</p>
        <div className="mt-3 flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="flex gap-3">
              <div className="flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] tabular-nums text-muted-foreground">
                {i + 1}
              </div>
              <div className="min-w-0">
                <p className="text-sm">{step.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          render={<Link href="/credits" />}
        >
          Purchase credits
        </Button>
      </div>
    </div>
  );
}
