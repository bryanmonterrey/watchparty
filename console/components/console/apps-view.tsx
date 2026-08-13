"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { HugeiconsIcon } from "@hugeicons/react";
import { DashboardSquare01Icon, Add01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc";
import { Chip } from "@/components/console/chip";

type VerifySummary = { met: number; total: number; complete: boolean };

// The portal-level Applications grid (docs/console-discord-reference.md §14):
// square cards with the app icon (or its name on a tile when none is set) and
// a "New Application" affordance. An app is the entity that owns credentials
// and carries an Ed25519 signing identity — keys, webhooks, and bots attach to
// it in later phases (docs/console-execution-plan.md).

const APP_CAP = 25;

function CreatePanel({ onDone }: { onDone: () => void }) {
  const utils = trpc.useUtils();
  const router = useRouter();
  const [name, setName] = React.useState("");
  const create = trpc.developerApps.create.useMutation({
    onSuccess: (data) => {
      void utils.developerApps.list.invalidate();
      router.push(`/apps/${data.id}`);
    },
  });

  return (
    <form
      className="rounded-xl border bg-card p-4 sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) create.mutate({ name: name.trim() });
      }}
    >
      <p className="text-sm font-medium">New application</p>
      <p className="mt-1 text-xs text-muted-foreground">
        What should we call it? You can add an icon, description, and tags once
        it&apos;s created.
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
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      {create.error ? (
        <p className="mt-2 text-xs text-destructive">{create.error.message}</p>
      ) : null}
    </form>
  );
}

function AppCard({
  app,
  verify,
}: {
  app: { id: string; name: string; iconUrl: string | null };
  verify?: VerifySummary;
}) {
  return (
    <Link
      href={`/apps/${app.id}`}
      className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 text-center transition-colors hover:bg-accent/50"
    >
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
        {app.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={app.iconUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="line-clamp-2 px-2 text-sm font-medium text-muted-foreground">
            {app.name}
          </span>
        )}
      </div>
      <span className="w-full truncate text-sm font-medium">{app.name}</span>
      {verify ? (
        verify.complete ? (
          <Chip tone="good">Verified</Chip>
        ) : (
          <Chip tone="warn">{verify.total - verify.met} to verify</Chip>
        )
      ) : null}
    </Link>
  );
}

export function AppsView() {
  const apps = trpc.developerApps.list.useQuery();
  const verify = trpc.developerApps.verificationSummary.useQuery();
  const [creating, setCreating] = React.useState(false);
  const atCap = !!apps.data && apps.data.length >= APP_CAP;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">Apps</h2>
            {apps.data ? (
              <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {apps.data.length} of {APP_CAP}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            An app owns your credentials and carries a signing identity. Connect
            keys and webhooks to it.
          </p>
        </div>
        {!creating ? (
          <Button className="gap-1.5" disabled={atCap} onClick={() => setCreating(true)}>
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            New application
          </Button>
        ) : null}
      </div>

      {creating ? <CreatePanel onDone={() => setCreating(false)} /> : null}

      {apps.isPending ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          <Skeleton className="aspect-[4/5] rounded-xl" />
          <Skeleton className="aspect-[4/5] rounded-xl" />
          <Skeleton className="aspect-[4/5] rounded-xl" />
        </div>
      ) : apps.error ? (
        <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
          {apps.error.message}
        </div>
      ) : apps.data.length === 0 && !creating ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg border">
            <HugeiconsIcon icon={DashboardSquare01Icon} className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">No apps yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Create one to get a signing identity and a home for your keys and
              webhooks.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            Create your first app
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {apps.data.map((app) => (
            <AppCard key={app.id} app={app} verify={verify.data?.[app.id]} />
          ))}
        </div>
      )}
    </div>
  );
}
