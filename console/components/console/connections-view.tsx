"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ConnectIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc";
import { Skeleton } from "@/components/ui/skeleton";
import { Chip } from "@/components/console/chip";
import { CopyButton } from "@/components/console/copy-button";
import { formatDate } from "@/lib/format";

// X's Connections page (docs/console-x-reference.md §10): the pull endpoint's
// throughput + docs, and the REAL socket-connection table — the push transport
// rides the shared realtime DO (dev-stream rooms), which accounts each
// connection; developerStreamRules.connections reads that log. Push is a
// NUDGE ("new deliveries past seq N") — data still flows through the pull
// endpoint, which keeps at-least-once/replay semantics in one place.

const STREAM_URL = "https://watchparty.xyz/api/stream/events";
const CURL = `curl -s "${STREAM_URL}?since=0" \\
  -H "x-api-key: wp_live_…"`;
const SOCKET_CURL = `curl -s "https://watchparty.xyz/api/stream/token" \\
  -H "x-api-key: wp_live_…"
# → { token, room, host } — then connect:
# wss://<host>/parties/chat/<room>?token=<token>
# each "deliveries" event = pull /api/stream/events?since=<your cursor>`;

function ConnectionsTable() {
  const conns = trpc.developerStreamRules.connections.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <p className="text-sm font-medium">Socket connections</p>
        {conns.data?.some((c) => c.active) ? <Chip tone="good">Active</Chip> : null}
      </div>
      <div className="p-4">
        {conns.isPending ? (
          <Skeleton className="h-16 rounded-lg" />
        ) : conns.data == null ? (
          <p className="text-xs text-muted-foreground">
            The realtime layer isn&apos;t reachable right now — the pull endpoint
            above is unaffected.
          </p>
        ) : conns.data.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No socket connections yet. Mint a token via{" "}
            <span className="font-mono">GET /api/stream/token</span> and connect —
            recent connections appear here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Connection</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Connected</th>
                  <th className="pb-2 font-medium">Disconnected</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {conns.data.map((c) => (
                  <tr key={`${c.id}-${c.connectedAt}`}>
                    <td className="max-w-32 truncate py-2 pr-4 font-mono">{c.id}</td>
                    <td className="py-2 pr-4">
                      {c.active ? <Chip tone="good">Active</Chip> : <Chip>Closed</Chip>}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">{formatDate(new Date(c.connectedAt))}</td>
                    <td className="py-2 tabular-nums">
                      {c.disconnectedAt ? formatDate(new Date(c.disconnectedAt)) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

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

      {/* The push socket */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="flex items-center gap-2 text-sm font-medium">
            <HugeiconsIcon icon={ConnectIcon} className="size-3.5" />
            Push socket
          </p>
          <Chip tone="good">Live</Chip>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="rounded-lg border bg-muted/30 p-3">
            <pre className="overflow-x-auto whitespace-pre text-xs text-muted-foreground">{SOCKET_CURL}</pre>
          </div>
          <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <li>
              Tokens live 120 seconds — re-mint on every reconnect (that TTL is
              also the revocation bound for a revoked key).
            </li>
            <li>
              The socket only nudges: each <span className="font-mono">deliveries</span>{" "}
              event means new rows exist past your cursor — pull the endpoint
              above to fetch them. Nothing is lost if the socket drops.
            </li>
          </ul>
        </div>
      </div>

      <ConnectionsTable />
    </div>
  );
}
