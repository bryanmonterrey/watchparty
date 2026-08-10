"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { HugeiconsIcon } from "@hugeicons/react";
import { Key01Icon, Add01Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc";
import { money, formatDate } from "@/lib/format";
import { Chip } from "@/components/console/chip";
import { CopyButton } from "@/components/console/copy-button";

// Flows ported from the interim portal (components/developer/console-view.tsx):
// plaintext-once creation, paste-a-signature funding (linked out to /credits),
// and the two-step inline revoke confirm. `list` is invalidated after every
// mutation so balances stay honest.

function CreatePanel({ onDone }: { onDone: () => void }) {
  const utils = trpc.useUtils();
  const [name, setName] = React.useState("");
  const create = trpc.apiKeys.create.useMutation({
    onSuccess: () => void utils.apiKeys.list.invalidate(),
  });

  if (create.data) {
    return (
      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <p className="text-sm font-medium">Your new key</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This is the only time it will be shown. Store it somewhere safe — we
          keep a hash, not the key.
        </p>
        <div className="mt-3 flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
          <code className="min-w-0 flex-1 select-all break-all font-mono text-xs">
            {create.data.key}
          </code>
          <CopyButton value={create.data.key} />
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              create.reset();
              setName("");
              onDone();
            }}
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="rounded-xl border bg-card p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) create.mutate({ name: name.trim() });
      }}
    >
      <p className="text-sm font-medium">Create a key</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Name it after the app or agent that will use it.
      </p>
      <div className="mt-3 flex gap-2">
        <Input
          autoFocus
          maxLength={64}
          placeholder="My trading bot"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={!name.trim() || create.isPending}>
          {create.isPending ? "Creating…" : "Create"}
        </Button>
      </div>
      {create.error ? (
        <p className="mt-2 text-xs text-destructive">{create.error.message}</p>
      ) : null}
    </form>
  );
}

function KeyRow({
  k,
}: {
  k: {
    id: string;
    name: string;
    prefix: string;
    revoked: boolean;
    createdAt: Date;
    lastUsedAt: Date | null;
    balanceUsd: number;
    spentUsd: number;
  };
}) {
  const utils = trpc.useUtils();
  const [confirming, setConfirming] = React.useState(false);
  const revoke = trpc.apiKeys.revoke.useMutation({
    onSuccess: () => void utils.apiKeys.list.invalidate(),
  });

  return (
    <div
      className={`flex flex-col gap-3 rounded-xl border bg-card p-4 ${k.revoked ? "opacity-50" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded-lg border">
          <HugeiconsIcon icon={Key01Icon} className="size-3.5 text-muted-foreground" />
        </div>
        <Link
          href={`/keys/${k.id}`}
          className="text-sm font-medium underline-offset-2 hover:underline"
        >
          {k.name}
        </Link>
        <Chip>
          <span className="font-mono">{k.prefix}</span>
        </Chip>
        {k.revoked ? <Chip tone="bad">Revoked</Chip> : <Chip tone="good">Active</Chip>}
        <div className="flex-1" />
        {!k.revoked ? (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" render={<Link href={`/credits?key=${k.id}`} />}>
              Fund
            </Button>
            {confirming ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ id: k.id })}
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
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>
          Created {formatDate(k.createdAt)}
          {" · "}
          {k.lastUsedAt ? `last used ${formatDate(k.lastUsedAt)}` : "never used"}
        </span>
        <span className="tabular-nums">
          Balance <span className="font-medium text-foreground">{money(k.balanceUsd)}</span>
        </span>
        <span className="tabular-nums">
          Spent <span className="font-medium text-foreground">{money(k.spentUsd)}</span>
        </span>
      </div>
      {revoke.error ? <p className="text-xs text-destructive">{revoke.error.message}</p> : null}
    </div>
  );
}

// Keep in step with MAX_ACTIVE_KEYS in server/routers/apiKeys.ts.
const KEY_CAP = 10;

export function KeysView() {
  const keys = trpc.apiKeys.list.useQuery();
  const [creating, setCreating] = React.useState(false);
  const activeCount = (keys.data ?? []).filter((k) => !k.revoked).length;
  const atCap = !!keys.data && activeCount >= KEY_CAP;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Keys</h2>
            {/* The portal's "(n of cap)" quota counter, live wherever a cap exists. */}
            {keys.data ? (
              <Chip>
                {activeCount} of {KEY_CAP} active
              </Chip>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A key is what your app or agent sends as{" "}
            <span className="font-mono">x-api-key</span>.
            {atCap ? " You're at the cap — revoke a key to create another." : ""}
          </p>
        </div>
        {!creating ? (
          <Button className="gap-1.5" disabled={atCap} onClick={() => setCreating(true)}>
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Create key
          </Button>
        ) : null}
      </div>

      {creating ? <CreatePanel onDone={() => setCreating(false)} /> : null}

      {keys.isPending ? (
        <>
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </>
      ) : keys.error ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {keys.error.message}
        </div>
      ) : keys.data.length === 0 && !creating ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg border">
            <HugeiconsIcon icon={Key01Icon} className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No keys yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create one, fund it with credits, and you&apos;re calling the API
              in minutes.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            Create your first key
          </Button>
        </div>
      ) : (
        keys.data.map((k) => <KeyRow key={k.id} k={k} />)
      )}
    </div>
  );
}
