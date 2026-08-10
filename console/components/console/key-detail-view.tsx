"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HugeiconsIcon } from "@hugeicons/react";
import { Key01Icon, LinkSquare02Icon, Invoice01Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc";
import { money, formatDate, formatDateTime, shortSig } from "@/lib/format";
import { Chip } from "@/components/console/chip";
import { CopyButton } from "@/components/console/copy-button";
import { SpendChart } from "@/components/console/spend-chart";

// The X console's app-detail page (docs/console-x-reference.md §6) mapped to
// one key: breadcrumb, name + status chips, stat cards, the "Keys & Tokens"
// row group, per-key 30d spend, per-key deposits. Everything reads the same
// three queries the rest of the console already uses — a key has no dedicated
// endpoint, and with ≤10 active keys `list` IS the detail query.

export function KeyDetailView({ id }: { id: string }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const keys = trpc.apiKeys.list.useQuery();
  const usage = trpc.apiKeys.usageSeries.useQuery();
  const deposits = trpc.apiKeys.deposits.useQuery();

  const key = (keys.data ?? []).find((k) => k.id === id);

  const [confirming, setConfirming] = React.useState(false);
  const revoke = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => {
      void utils.apiKeys.list.invalidate();
      setConfirming(false);
    },
  });

  const keyUsage = React.useMemo(
    () => (usage.data ?? []).filter((r) => r.keyId === id),
    [usage.data, id],
  );
  const spent30d = keyUsage.reduce((s, r) => s + r.spentUsd, 0);
  const keyDeposits = React.useMemo(
    () => (deposits.data ?? []).filter((d) => d.keyId === id),
    [deposits.data, id],
  );

  if (keys.isPending) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <Skeleton className="h-6 w-40 rounded-md" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (keys.error || !key) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg border">
            <HugeiconsIcon icon={Key01Icon} className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {keys.error ? keys.error.message : "No key with that id"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              It may belong to another account, or the link is stale.
            </p>
          </div>
          <Button size="sm" variant="outline" render={<Link href="/keys" />}>
            Back to keys
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <p className="text-xs text-muted-foreground">
        <Link href="/keys" className="transition-colors hover:text-foreground">
          Keys
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-foreground">{key.name}</span>
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex size-9 items-center justify-center rounded-lg border">
          <HugeiconsIcon icon={Key01Icon} className="size-4 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold">{key.name}</h2>
        {key.revoked ? <Chip tone="bad">Revoked</Chip> : <Chip tone="good">Active</Chip>}
        <div className="flex-1" />
        {!key.revoked ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" render={<Link href={`/credits?key=${key.id}`} />}>
              Fund
            </Button>
            {confirming ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ id: key.id })}
                >
                  {revoke.isPending ? "Revoking…" : "Confirm revoke"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  Keep
                </Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                Revoke
              </Button>
            )}
          </div>
        ) : null}
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Created {formatDate(key.createdAt)}
        {" · "}
        {key.lastUsedAt ? `last used ${formatDate(key.lastUsedAt)}` : "never used"}
      </p>
      {revoke.error ? <p className="text-xs text-destructive">{revoke.error.message}</p> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">Balance</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{money(key.balanceUsd)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">Spent (30 days)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{money(spent30d)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">Spent (lifetime)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{money(key.spentUsd)}</p>
        </div>
      </div>

      {/* The Keys & Tokens row group. Our key is hashed at rest, so there is
          no reveal — the prefix is all that survives creation, on purpose. */}
      <div className="rounded-xl border bg-card">
        <p className="border-b px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
          Authentication
        </p>
        <div className="flex flex-col divide-y">
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">API key</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sent as <span className="font-mono">x-api-key</span>. Shown once at
                creation — we store a hash, not the key.
              </p>
            </div>
            <code className="font-mono text-xs text-muted-foreground">{key.prefix}</code>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Key ID</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Public identifier — safe to reference in support requests.
              </p>
            </div>
            <code className="font-mono text-xs">{key.id}</code>
            <CopyButton value={key.id} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-baseline justify-between">
          <p className="text-sm font-medium">Usage</p>
          <p className="text-xs text-muted-foreground">last 30 days · UTC</p>
        </div>
        <div className="mt-4">
          {usage.isPending ? (
            <Skeleton className="h-48 rounded-lg" />
          ) : usage.error ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {usage.error.message}
            </p>
          ) : (
            <SpendChart data={keyUsage} />
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <div className="flex items-baseline justify-between border-b px-4 py-2.5 sm:px-5">
          <p className="text-xs text-muted-foreground">Deposits to this key</p>
          {keyDeposits.length > 0 ? (
            <Link
              href="/payments"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              All payments
            </Link>
          ) : null}
        </div>
        {deposits.isPending ? (
          <div className="flex flex-col gap-2 p-4">
            <Skeleton className="h-10 rounded-lg" />
            <Skeleton className="h-10 rounded-lg" />
          </div>
        ) : deposits.error ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {deposits.error.message}
          </p>
        ) : keyDeposits.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg border">
              <HugeiconsIcon icon={Invoice01Icon} className="size-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No deposits yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Fund this key and the deposit shows up here.
              </p>
            </div>
            {!key.revoked ? (
              <Button
                size="sm"
                variant="outline"
                render={<Link href={`/credits?key=${key.id}`} />}
              >
                Buy credits
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col divide-y">
            {keyDeposits.map((d) => (
              <div
                key={d.txSignature}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm sm:px-5"
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
                <Chip tone="good">Succeeded</Chip>
                <div className="flex-1" />
                <span className="tabular-nums">{money(d.amountUsd)}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(d.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
