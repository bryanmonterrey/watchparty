"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, ViewIcon, RefreshIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Button } from "@/components/ui/button";

// The studio's stream cockpit (S2). A widget grid, not a form: live stat
// tiles, the go-live control, Channel Actions (chat modes), ingest, and stream
// info — the Kick/Twitch Stream-Manager shape, surfacing procedures that
// already exist (stream.getMine / generateConnection / updateInfo /
// setLiveStatus / setChatMode / dashboardStats). Chat panel, activity feed,
// and session-health are the next cockpit slice.

function CopyField({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  const [shown, setShown] = React.useState(!secret);
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-3">
        <code className="min-w-0 flex-1 truncate font-mono text-xs">
          {shown ? value : "•".repeat(Math.min(value.length, 32))}
        </code>
        {secret ? (
          <button
            type="button"
            onClick={() => setShown((s) => !s)}
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label={shown ? "Hide" : "Reveal"}
          >
            <HugeiconsIcon icon={ViewIcon} className="size-4" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Copy"
        >
          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className="size-4" />
        </button>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2.5">
      <p className="text-lg font-semibold tabular-nums leading-tight">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

const CHAT_MODES = [
  { key: "everyone", label: "Everyone" },
  { key: "followers", label: "Followers" },
  { key: "subscribers", label: "Subscribers" },
] as const;

function ChannelActions({ creatorId, mode }: { creatorId: string; mode: string }) {
  const utils = trpc.useUtils();
  const setChatMode = trpc.stream.setChatMode.useMutation({
    onMutate: async (vars) => {
      // Optimistic — the toggle should feel instant while live.
      await utils.stream.getMine.cancel();
      const prev = utils.stream.getMine.getData();
      utils.stream.getMine.setData(undefined, (old) =>
        old ? { ...old, chatMode: vars.mode } : old,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) utils.stream.getMine.setData(undefined, ctx.prev);
    },
    onSettled: () => void utils.stream.getMine.invalidate(),
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
      <p className="text-sm font-medium">Channel actions</p>
      <p className="mt-1 text-xs text-muted-foreground">Who can talk in your chat.</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {CHAT_MODES.map((m) => {
          const on = mode === m.key;
          return (
            <button
              key={m.key}
              type="button"
              disabled={setChatMode.isPending}
              onClick={() => setChatMode.mutate({ creatorId, mode: m.key })}
              className={`rounded-xl border px-2 py-2 text-xs font-medium transition-colors disabled:opacity-60 ${
                on ? "border-emerald-500/40 bg-emerald-500/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-accent/50"
              }`}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      {setChatMode.error ? (
        <p className="mt-2 text-xs text-destructive">{setChatMode.error.message}</p>
      ) : null}
    </div>
  );
}

export function StreamManager() {
  const utils = trpc.useUtils();
  const { data: session } = useAuthSession();
  const userId = session?.user?.id;
  const mine = trpc.stream.getMine.useQuery(undefined, { refetchInterval: 20_000 });
  const stats = trpc.stream.dashboardStats.useQuery(undefined, { refetchInterval: 60_000 });
  const stream = mine.data;

  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("");
  React.useEffect(() => {
    if (stream) {
      setTitle(stream.title ?? "");
      setCategory(stream.category ?? "");
    }
  }, [stream]);

  const generate = trpc.stream.generateConnection.useMutation({
    onSuccess: () => void utils.stream.getMine.invalidate(),
  });
  const updateInfo = trpc.stream.updateInfo.useMutation({
    onSuccess: () => void utils.stream.getMine.invalidate(),
  });
  const setLive = trpc.stream.setLiveStatus.useMutation({
    onSuccess: () => void utils.stream.getMine.invalidate(),
  });

  const provisioned = !!stream?.streamKey && !!stream?.serverUrl;
  const isLive = !!stream?.isLive;
  const dirty = title !== (stream?.title ?? "") || category !== (stream?.category ?? "");
  const fmt = (n: number | undefined) => (n === undefined ? "—" : new Intl.NumberFormat().format(n));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Streams</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your broadcast cockpit — go live, control chat, and set what viewers
            see.
          </p>
        </div>
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-500">
            <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
            Live
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/50" />
            Offline
          </span>
        )}
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Viewers" value={isLive ? fmt(stream?.viewerCount ?? 0) : "—"} />
        <StatTile label="Followers" value={fmt(stats.data?.followers)} />
        <StatTile label="Subscribers" value={fmt(stats.data?.subscribers)} />
        <StatTile label="Session" value={isLive ? "Live" : "Offline"} />
      </div>

      {mine.isPending ? (
        <div className="h-40 animate-pulse rounded-2xl border border-border/60 bg-muted/30" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Go-live status card */}
          <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
            <p className="text-sm font-medium">
              {isLive ? "You're live" : provisioned ? "Ready to go live" : "Set up your stream"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isLive
                ? "Your channel is broadcasting. Ending here marks you offline for viewers."
                : provisioned
                  ? "Point your encoder at the ingest, or flip the switch here. The live badge also flips automatically when frames arrive."
                  : "Generate your ingest server and stream key, then point OBS or your encoder at them."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!provisioned ? (
                <Button disabled={generate.isPending} onClick={() => generate.mutate({ ingressType: "RTMP" })}>
                  {generate.isPending ? "Generating…" : "Generate stream key"}
                </Button>
              ) : isLive ? (
                <Button variant="destructive" disabled={setLive.isPending} onClick={() => setLive.mutate({ isLive: false })}>
                  {setLive.isPending ? "Ending…" : "End stream"}
                </Button>
              ) : (
                <Button disabled={setLive.isPending} onClick={() => setLive.mutate({ isLive: true })}>
                  {setLive.isPending ? "Going live…" : "Go live"}
                </Button>
              )}
            </div>
            {generate.error ? <p className="mt-2 text-xs text-destructive">{generate.error.message}</p> : null}
          </div>

          {/* Channel actions (chat modes) */}
          {userId ? <ChannelActions creatorId={userId} mode={stream?.chatMode ?? "everyone"} /> : null}

          {/* Ingest */}
          {provisioned ? (
            <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Ingest</p>
                <button
                  type="button"
                  onClick={() => generate.mutate({ ingressType: "RTMP" })}
                  disabled={generate.isPending}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  <HugeiconsIcon icon={RefreshIcon} className="size-3" />
                  Refresh
                </button>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Paste into OBS → Settings → Stream (Custom). Keep your key
                private — anyone with it can broadcast as you.
              </p>
              <div className="mt-3 flex flex-col gap-3">
                <CopyField label="Server URL" value={stream!.serverUrl!} />
                <CopyField label="Stream key" value={stream!.streamKey!} secret />
                {stream?.playbackUrl ? <CopyField label="Playback URL" value={stream.playbackUrl} /> : null}
              </div>
            </div>
          ) : null}

          {/* Stream info */}
          <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
            <p className="text-sm font-medium">What viewers see</p>
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Title</p>
                <input
                  value={title}
                  maxLength={100}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Give your stream a title"
                  className="h-11 w-full rounded-xl border border-border/60 bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Category</p>
                <input
                  value={category}
                  maxLength={50}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. Just Chatting, Trading, Music"
                  className="h-11 w-full rounded-xl border border-border/60 bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="flex items-center gap-3">
                <Button
                  disabled={!dirty || updateInfo.isPending}
                  onClick={() => updateInfo.mutate({ title: title.trim(), category: category.trim() })}
                >
                  {updateInfo.isPending ? "Saving…" : "Save"}
                </Button>
                {updateInfo.isSuccess && !dirty ? (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
