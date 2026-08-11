"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ConnectIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/console/chip";
import { CopyButton } from "@/components/console/copy-button";
import { formatDate } from "@/lib/format";

// X's Connections page (docs/console-x-reference.md §10) is a table of held
// streaming connections. watchparty's filtered stream is delivered by CURSOR
// PULL, not a long-lived socket (the production-correct transport on
// Workers/OpenNext until the shared realtime layer lands) — so instead of
// faking a connection table this page documents the live pull endpoint and
// shows its real throughput. A WebSocket connection view can be added here when
// the socket transport rides the same queue.

const STREAM_URL = "https://watchparty.xyz/api/stream/events";
const CURL = `curl -s "${STREAM_URL}?since=0" \\
  -H "x-api-key: wp_live_…"`;

export function ConnectionsView() {
  const stats = trpc.developerStreamRules.deliveryStats.useQuery();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h2 className="text-xl font-semibold">Connections</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your filtered event stream is delivered by cursor pull — poll the
          endpoint with the last <span className="font-mono">seq</span> you saw
          and advance the returned <span className="font-mono">cursor</span>.
        </p>
      </div>

      {/* Live throughput */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Matched events · 24h</p>
          {stats.isPending ? (
            <Skeleton className="mt-1 h-7 w-16 rounded-md" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.data?.last24h ?? 0}</p>
          )}
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Last match</p>
          {stats.isPending ? (
            <Skeleton className="mt-1 h-7 w-24 rounded-md" />
          ) : stats.data?.lastAt ? (
            <p className="mt-1 text-sm font-medium">{formatDate(stats.data.lastAt)}</p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No matches yet</p>
          )}
        </div>
      </div>

      {/* The endpoint */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="text-sm font-medium">Stream endpoint</p>
          <Chip tone="good">Live</Chip>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2">
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium">GET</span>
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{STREAM_URL}</span>
            <CopyButton value={STREAM_URL} />
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <pre className="overflow-x-auto whitespace-pre text-xs text-muted-foreground">{CURL}</pre>
          </div>
          <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <li>
              Authenticate with an app key in the{" "}
              <span className="font-mono">x-api-key</span> header — an app-scoped
              key streams that app; an account key streams all your apps.
            </li>
            <li>
              Pass <span className="font-mono">?since=&lt;cursor&gt;</span> to resume;
              the response returns the next batch and a new{" "}
              <span className="font-mono">cursor</span>.
            </li>
            <li>Delivery is at-least-once and replayable for 3 days — dedupe on <span className="font-mono">seq</span>.</li>
            <li>Only events matching your Streaming rules are queued.</li>
          </ul>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <HugeiconsIcon icon={ConnectIcon} className="size-3.5" />
        A live WebSocket connection view will appear here when the socket
        transport ships on top of this same stream.
      </div>
    </div>
  );
}
