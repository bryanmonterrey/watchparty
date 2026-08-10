"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HugeiconsIcon } from "@hugeicons/react";
import { UnfoldMoreIcon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc";
import { money } from "@/lib/format";
import { CopyButton } from "@/components/console/copy-button";

// The funding model (ported from the interim portal): send USDC on Solana to
// the treasury from ANY wallet, then redeem the transaction signature here.
// No wallet stack in the console bundle, ever — that's the whole reason the
// flow is paste-a-signature.

export function CreditsView() {
  const params = useSearchParams();
  const utils = trpc.useUtils();
  const keys = trpc.apiKeys.list.useQuery();
  const info = trpc.apiKeys.depositInfo.useQuery();

  const active = React.useMemo(
    () => (keys.data ?? []).filter((k) => !k.revoked),
    [keys.data],
  );
  const totalBalance = active.reduce((s, k) => s + k.balanceUsd, 0);

  const [keyId, setKeyId] = React.useState<string | null>(null);
  // Honor ?key= from the Keys page's Fund button once the list arrives.
  React.useEffect(() => {
    if (keyId || !active.length) return;
    const wanted = params.get("key");
    setKeyId(active.some((k) => k.id === wanted) ? wanted : active[0].id);
  }, [active, keyId, params]);
  const selected = active.find((k) => k.id === keyId) ?? null;

  const [amount, setAmount] = React.useState("10");
  const [signature, setSignature] = React.useState("");
  const redeem = trpc.apiKeys.redeemDeposit.useMutation({
    onSuccess: () => {
      void utils.apiKeys.list.invalidate();
      void utils.apiKeys.deposits.invalidate();
      setSignature("");
    },
  });

  const usd = Number.parseFloat(amount);
  const canRedeem =
    !!selected && Number.isFinite(usd) && usd >= 1 && signature.trim().length >= 64;

  // The Discord Premium Apps opener (console-discord-reference.md §13): the
  // whole journey compressed to three numbered steps and one CTA, shown only
  // until the first credits land.
  const showOnboarding = !!keys.data && totalBalance === 0;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
      {showOnboarding ? (
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <p className="text-sm font-medium">Start calling the paid API</p>
          <div className="mt-3 flex flex-col gap-3">
            {[
              {
                title: "Create a key",
                desc: "Your app or agent sends it as x-api-key on every request.",
              },
              {
                title: "Fund it with USDC",
                desc: "Send USDC on Solana from any wallet, then redeem the transaction signature below. 1 credit = $1.",
              },
              {
                title: "Call the API",
                desc: "Calls draw down the key's balance — from $0.001 each. Agents can skip all of this and pay per request with x402.",
              },
            ].map((s, i) => (
              <div key={s.title} className="flex items-start gap-3">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums">
                  {i + 1}
                </div>
                <div>
                  <p className="text-sm font-medium">{s.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
          {active.length === 0 ? (
            <Button size="sm" className="mt-4" render={<Link href="/keys" />}>
              Create a key
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <p className="text-xs text-muted-foreground">Remaining balance</p>
        {keys.isPending ? (
          <Skeleton className="mt-1 h-9 w-32 rounded-md" />
        ) : (
          <p className="mt-1 text-3xl font-semibold tabular-nums">{money(totalBalance)}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          1 credit = $1, held as USDC · across {active.length} active{" "}
          {active.length === 1 ? "key" : "keys"}
        </p>
      </div>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <p className="text-sm font-medium">Purchase credits</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Send USDC on Solana from any wallet to the deposit address, then paste
          the transaction signature. Minimum $1.
        </p>

        {active.length === 0 && !keys.isPending ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">
              You need an active key to hold credits.
            </p>
            <Button size="sm" variant="outline" render={<Link href="/keys" />}>
              Create a key
            </Button>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Deposit address</p>
              {info.isPending ? (
                <Skeleton className="h-11 rounded-lg" />
              ) : info.error ? (
                <p className="text-xs text-destructive">{info.error.message}</p>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
                  <code className="min-w-0 flex-1 select-all break-all font-mono text-xs">
                    {info.data.address}
                  </code>
                  <CopyButton value={info.data.address} />
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Credit to key</p>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="outline" className="w-full justify-between font-normal">
                        <span className="truncate">
                          {selected ? selected.name : "Select a key"}
                        </span>
                        <HugeiconsIcon
                          icon={UnfoldMoreIcon}
                          className="size-4 text-muted-foreground"
                        />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="start" className="w-64">
                    {active.map((k) => (
                      <DropdownMenuItem key={k.id} onClick={() => setKeyId(k.id)}>
                        <span className="min-w-0 flex-1 truncate">{k.name}</span>
                        <span className="ml-3 text-xs tabular-nums text-muted-foreground">
                          {money(k.balanceUsd)}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Amount (USD)</p>
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>

            <div>
              <p className="mb-1 text-xs text-muted-foreground">Transaction signature</p>
              <Input
                placeholder="Paste the Solana transaction signature"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                className="font-mono"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              {redeem.data ? (
                <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4" />
                  Credits added — balance is now {money(redeem.data.balanceUsd)}
                </p>
              ) : redeem.error ? (
                <p className="text-xs text-destructive">{redeem.error.message}</p>
              ) : (
                <span />
              )}
              <Button
                disabled={!canRedeem || redeem.isPending}
                onClick={() => {
                  if (!selected || !canRedeem) return;
                  redeem.mutate({
                    keyId: selected.id,
                    signature: signature.trim(),
                    amountUsd: usd,
                  });
                }}
              >
                {redeem.isPending ? "Verifying…" : "Redeem deposit"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <p className="text-sm font-medium">Balances by key</p>
          <div className="mt-3 flex flex-col divide-y">
            {keys.isPending ? (
              <Skeleton className="h-20 rounded-lg" />
            ) : active.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">No active keys.</p>
            ) : (
              active.map((k) => (
                <div key={k.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{k.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{k.prefix}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm tabular-nums">{money(k.balanceUsd)}</span>
                    <Button size="sm" variant="ghost" onClick={() => setKeyId(k.id)}>
                      Fund
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4 sm:p-5">
          <p className="text-sm font-medium">Prefer no balances?</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The API is x402-native: a request without a key gets a payment
            challenge, and an agent can settle it on-chain per call — no
            account, no prepaid credits.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            render={
              <a href="https://docs.watchparty.xyz" target="_blank" rel="noopener noreferrer" />
            }
          >
            How x402 works
          </Button>
        </div>
      </div>
    </div>
  );
}
