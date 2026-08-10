"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, LinkSquare02Icon, Invoice01Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc";
import { money, formatDateTime, shortSig } from "@/lib/format";
import { Chip } from "@/components/console/chip";
import { CopyButton } from "@/components/console/copy-button";

// The X console's Payments table, mapped to our reality: every payment is a
// verified USDC deposit on Solana, so the "invoice" is a Solscan link and the
// status is always Succeeded (unverified rows never survive redeemDeposit).

export function PaymentsView() {
  const deposits = trpc.apiKeys.deposits.useQuery();
  const [query, setQuery] = React.useState("");

  const rows = React.useMemo(() => {
    const all = deposits.data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (d) =>
        d.txSignature.toLowerCase().includes(q) || d.keyName.toLowerCase().includes(q),
    );
  }, [deposits.data, query]);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Payments</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Credit deposits, verified on-chain. USDC on Solana.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <HugeiconsIcon
            icon={Search01Icon}
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Search signature or key…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 pl-9"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[1.6fr_0.9fr_1fr_1fr_0.7fr_1.1fr] gap-3 border-b px-4 py-2.5 text-xs text-muted-foreground">
            <span>Transaction</span>
            <span>Status</span>
            <span>Method</span>
            <span>Key</span>
            <span className="text-right">Amount</span>
            <span className="text-right">Date</span>
          </div>

          {deposits.isPending ? (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
              <Skeleton className="h-10 rounded-lg" />
            </div>
          ) : deposits.error ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              {deposits.error.message}
            </p>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg border">
                <HugeiconsIcon icon={Invoice01Icon} className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {query ? "No matching payments" : "No payments yet"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {query
                    ? "Try a different signature or key name."
                    : "Fund a key and the deposit shows up here."}
                </p>
              </div>
              {!query ? (
                <Button size="sm" variant="outline" render={<Link href="/credits" />}>
                  Buy credits
                </Button>
              ) : null}
            </div>
          ) : (
            rows.map((d) => (
              <div
                key={d.txSignature}
                className="grid grid-cols-[1.6fr_0.9fr_1fr_1fr_0.7fr_1.1fr] items-center gap-3 border-b px-4 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-accent/50"
              >
                <span className="flex items-center gap-1">
                  <code className="font-mono text-xs">{shortSig(d.txSignature)}</code>
                  <CopyButton value={d.txSignature} />
                  <a
                    href={`https://solscan.io/tx/${d.txSignature}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="View on Solscan"
                  >
                    <HugeiconsIcon icon={LinkSquare02Icon} className="size-3.5" />
                  </a>
                </span>
                <span>
                  <Chip tone="good">Succeeded</Chip>
                </span>
                <span className="text-xs text-muted-foreground">USDC · Solana</span>
                <span className="truncate text-xs">{d.keyName}</span>
                <span className="text-right tabular-nums">{money(d.amountUsd)}</span>
                <span className="text-right text-xs text-muted-foreground">
                  {formatDateTime(d.createdAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {deposits.data && deposits.data.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {rows.length} of {deposits.data.length} payments · most recent 200
        </p>
      ) : null}
    </div>
  );
}
