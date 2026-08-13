"use client";

import * as React from "react";
import Link from "next/link";
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
import {
  FilterIcon,
  UnfoldMoreIcon,
  Add01Icon,
  Cancel01Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc";
import { Chip } from "@/components/console/chip";

// X's Streaming Rules page (docs/console-x-reference.md §11): per-app filtered
// stream rules with an Add Rules modal. Rules are stored and managed here; the
// real-time matching engine is a later phase, so the header says so honestly
// (same empty-then-populated shape X shows).

/** Micro-units → $ display. Local copy of lib/developer/stream-pricing's helper
 *  (the console can't import main-app runtime code — type-only boundary). */
function microToUsd(micro: number): string {
  return `$${(micro / 1_000_000).toFixed(micro % 1_000_000 === 0 ? 2 : 4)}`;
}

function AddRulesModal({
  appId,
  appName,
  onClose,
}: {
  appId: string;
  appName: string;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [rows, setRows] = React.useState([{ value: "", tag: "" }]);
  const add = trpc.developerStreamRules.add.useMutation({
    onSuccess: () => {
      void utils.developerStreamRules.list.invalidate();
      onClose();
    },
  });
  const valid = rows.filter((r) => r.value.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border bg-card p-5 shadow-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Add Rules</h3>
          <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={onClose}>
            <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
          </Button>
        </div>

        <div className="mt-4">
          <p className="mb-1 text-xs text-muted-foreground">App</p>
          <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">{appName}</div>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                {i === 0 ? <p className="mb-1 text-xs text-muted-foreground">Rule</p> : null}
                <Input
                  placeholder="coin:PARTY has:media"
                  value={r.value}
                  onChange={(e) =>
                    setRows((p) => p.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                  }
                  className="font-mono"
                />
              </div>
              <div className="w-32">
                {i === 0 ? <p className="mb-1 text-xs text-muted-foreground">Tag</p> : null}
                <Input
                  placeholder="tag"
                  value={r.tag}
                  onChange={(e) =>
                    setRows((p) => p.map((x, j) => (j === i ? { ...x, tag: e.target.value } : x)))
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remove"
                disabled={rows.length === 1}
                onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setRows((p) => [...p, { value: "", tag: "" }])}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-500 hover:text-blue-400"
        >
          <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
          Add another rule
        </button>

        {add.error ? <p className="mt-2 text-xs text-destructive">{add.error.message}</p> : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!valid.length || add.isPending}
            onClick={() =>
              add.mutate({
                appId,
                rules: valid.map((r) => ({ value: r.value.trim(), tag: r.tag.trim() || undefined })),
              })
            }
          >
            {add.isPending ? "Adding…" : `Add ${valid.length} Rule${valid.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function StreamingRulesView() {
  const apps = trpc.developerApps.list.useQuery();
  const [appId, setAppId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!appId && apps.data?.length) setAppId(apps.data[0].id);
  }, [apps.data, appId]);
  const selectedApp = apps.data?.find((a) => a.id === appId) ?? null;

  const utils = trpc.useUtils();
  const rules = trpc.developerStreamRules.list.useQuery(
    { appId: appId ?? "" },
    { enabled: !!appId },
  );
  const remove = trpc.developerStreamRules.remove.useMutation({
    onSuccess: () => void utils.developerStreamRules.list.invalidate(),
  });
  const stats = trpc.developerStreamRules.deliveryStats.useQuery(
    { appId: appId ?? "" },
    { enabled: !!appId },
  );
  const [adding, setAdding] = React.useState(false);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Streaming rules</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manage filtered stream rules for your apps. Matches deliver on
            <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono">GET /api/stream/events</code>.
            Delivery is <span className="font-medium text-foreground">free</span> —
            the stream is account-bounded (your own events only). Every rule
            needs at least one positive term.
          </p>
          {selectedApp && stats.data ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Last 24h: <span className="font-medium text-foreground">{stats.data.last24h}</span>{" "}
              {stats.data.last24h === 1 ? "delivery" : "deliveries"} ·{" "}
              <span className="font-medium text-foreground">{microToUsd(stats.data.last24hCostMicro)}</span>
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {selectedApp ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm" className="gap-2 font-normal">
                    <span className="max-w-40 truncate">{selectedApp.name}</span>
                    <HugeiconsIcon icon={UnfoldMoreIcon} className="size-3.5 text-muted-foreground" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                {(apps.data ?? []).map((a) => (
                  <DropdownMenuItem key={a.id} onClick={() => setAppId(a.id)}>
                    <span className="truncate">{a.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {selectedApp ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Refresh"
              onClick={() => void utils.developerStreamRules.list.invalidate()}
            >
              <HugeiconsIcon icon={RefreshIcon} className="size-4" />
            </Button>
          ) : null}
          <Button size="sm" className="gap-1.5" disabled={!selectedApp} onClick={() => setAdding(true)}>
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Add Rules
          </Button>
        </div>
      </div>

      {apps.isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : !apps.data?.length ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-10 text-center">
          <div className="flex size-10 items-center justify-center rounded-lg border">
            <HugeiconsIcon icon={FilterIcon} className="size-4 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Create an app first</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Streaming rules attach to an app. Create one, then add rules here.
          </p>
          <Button size="sm" variant="outline" render={<Link href="/apps" />}>
            Go to Apps
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 border-b px-4 py-2.5 text-xs font-medium text-muted-foreground">
            <span>Rule</span>
            <span className="w-24">Tag</span>
            <span className="w-16 text-right">Actions</span>
          </div>
          {rules.isPending ? (
            <div className="p-4">
              <Skeleton className="h-10 rounded-lg" />
            </div>
          ) : rules.data && rules.data.length > 0 ? (
            rules.data.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b px-4 py-3 last:border-b-0">
                <code className="min-w-0 truncate font-mono text-xs">{r.value}</code>
                <span className="w-24">{r.tag ? <Chip>{r.tag}</Chip> : <span className="text-xs text-muted-foreground">—</span>}</span>
                <span className="w-16 text-right">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Delete rule"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ ids: [r.id] })}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                  </Button>
                </span>
              </div>
            ))
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <HugeiconsIcon icon={FilterIcon} className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">No streaming rules found</p>
              <p className="text-xs text-muted-foreground">Add rules to start filtering the real-time stream.</p>
              <Button size="sm" className="mt-1 gap-1.5" onClick={() => setAdding(true)}>
                <HugeiconsIcon icon={Add01Icon} className="size-4" />
                Add Rules
              </Button>
            </div>
          )}
        </div>
      )}

      {adding && selectedApp ? (
        <AddRulesModal appId={selectedApp.id} appName={selectedApp.name} onClose={() => setAdding(false)} />
      ) : null}
    </div>
  );
}
