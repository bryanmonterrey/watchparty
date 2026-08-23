"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, ViewIcon, RefreshIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Button } from "@/components/ui/button";
import { StreamPreview } from "@/components/studio/stream-preview";
import { CategoryPicker } from "@/components/studio/category-picker";
import { PanelRail } from "@/components/studio/panel-rail";
import { StreamDiscoveryFields } from "@/components/studio/stream-discovery-fields";

// The studio's stream cockpit (S2). A widget grid, not a form: live stat
// tiles, the go-live control, Channel Actions (chat modes), ingest, and stream
// info — the Kick/Twitch Stream-Manager shape, surfacing procedures that
// already exist (stream.getMine / generateConnection / updateInfo /
// setLiveStatus / setChatMode / dashboardStats). Chat, session health,
// time-live and the Activity Feed have since landed; what the plan still lists
// as open here is the Mod-Actions feed (no audit-log procedure exists yet) and
// S6's saved/pop-out layouts.

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

function elapsedSince(start: Date | null | undefined): string {
  if (!start) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - new Date(start).getTime()) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// IVS StreamHealth → badge tone. STARVING = the encoder is struggling.
function healthBadge(health: string | null | undefined): { label: string; className: string } | null {
  if (!health) return null;
  if (health === "HEALTHY") return { label: "Healthy", className: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400" };
  if (health === "STARVING") return { label: "Unstable", className: "border-amber-500/30 text-amber-600 dark:text-amber-400" };
  return { label: "Unknown", className: "border-border/60 text-muted-foreground" };
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
  // IVS live vitals (health, start time, viewers) — polled fast while it matters.
  const live = trpc.stream.liveInfo.useQuery(undefined, { refetchInterval: 15_000 });
  const stream = mine.data;

  const [title, setTitle] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [streamTags, setStreamTags] = React.useState<string[]>([]);
  const [language, setLanguage] = React.useState<string>("");
  const [isMature, setIsMature] = React.useState(false);
  React.useEffect(() => {
    if (stream) {
      setTitle(stream.title ?? "");
      setCategory(stream.category ?? "");
      setStreamTags(stream.streamTags ?? []);
      // "" is the picker's "not stated"; null is the column's. They mean the
      // same thing and only one of them can live in a <select>.
      setLanguage(stream.language ?? "");
      setIsMature(stream.isMature ?? false);
    }
  }, [stream]);

  const resetKey = trpc.stream.resetStreamKey.useMutation({
    onSuccess: () => void utils.stream.getMine.invalidate(),
  });
  const [confirmReset, setConfirmReset] = React.useState(false);
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
  const isLive = !!stream?.isLive || !!live.data?.isLive;
  const health = healthBadge(live.data?.health);
  // IVS answering GetStream at all IS the ingest signal — ChannelNotBroadcasting
  // is how it says "no encoder". Distinct from `isLive`, which is the PUBLISHED
  // state the rails read.
  const ingesting = !!live.data?.isLive;
  const dirty =
    title !== (stream?.title ?? "") ||
    category !== (stream?.category ?? "") ||
    language !== (stream?.language ?? "") ||
    isMature !== (stream?.isMature ?? false) ||
    streamTags.join("\u0000") !== (stream?.streamTags ?? []).join("\u0000");
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
        <div className="flex items-center gap-2">
          {isLive && health ? (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${health.className}`}>
              {health.label}
            </span>
          ) : null}
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
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Viewers" value={isLive ? fmt(live.data?.viewerCount ?? stream?.viewerCount ?? 0) : "—"} />
        <StatTile label="Followers" value={fmt(stats.data?.followers)} />
        <StatTile label="Subscribers" value={fmt(stats.data?.subscribers)} />
        <StatTile label="Time live" value={isLive ? elapsedSince(live.data?.startedAt) : "—"} />
      </div>

      {mine.isPending ? (
        <div className="h-40 animate-pulse rounded-2xl border border-border/60 bg-muted/30" />
      ) : (
        <>
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <StreamPreview playbackUrl={stream?.playbackUrl ?? null} isLive={isLive} />
            <div className="grid gap-4 sm:grid-cols-2">
          {/* Go-live status card */}
          <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
            <p className="text-sm font-medium">
              {isLive ? "You're live" : provisioned ? "Ready to go live" : "Set up your stream"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isLive
                ? "Your channel is broadcasting. Ending here marks you offline for viewers."
                : !provisioned
                  ? "Generate your ingest server and stream key, then point OBS or your encoder at them."
                  : ingesting
                    ? "We can see your encoder. Going live puts you on the rails and opens your chat."
                    : "Press Start Streaming in OBS first. Going live before your encoder is sending would put a Live badge on a channel with no video."}
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
                <Button
                  disabled={setLive.isPending || !ingesting}
                  onClick={() => setLive.mutate({ isLive: true })}
                >
                  {setLive.isPending ? "Going live…" : ingesting ? "Go live" : "Waiting for OBS…"}
                </Button>
              )}
            </div>
            {generate.error ? <p className="mt-2 text-xs text-destructive">{generate.error.message}</p> : null}
            {setLive.error ? <p className="mt-2 text-xs text-destructive">{setLive.error.message}</p> : null}
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

              {/* A leaked key is the one stream problem you cannot fix by
                  editing something — until now the only remedy was support.
                  Two-step because it breaks every encoder already configured:
                  destructive, and worth one deliberate beat. */}
              <div className="mt-3 border-t border-border/60 pt-3">
                {confirmReset ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="w-full text-xs text-muted-foreground">
                      This invalidates your current key — OBS and anything else
                      configured with it stops working until you paste the new one.
                    </p>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={resetKey.isPending}
                      onClick={() => {
                        resetKey.mutate(undefined, { onSuccess: () => setConfirmReset(false) });
                      }}
                    >
                      {resetKey.isPending ? "Resetting…" : "Reset key"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    className="text-xs text-muted-foreground transition-colors hover:text-destructive"
                  >
                    Reset stream key
                  </button>
                )}
                {resetKey.error ? (
                  <p className="mt-2 text-xs text-destructive">{resetKey.error.message}</p>
                ) : null}
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
                <CategoryPicker value={category} onChange={setCategory} />
              </div>
              <StreamDiscoveryFields
                tags={streamTags}
                onTagsChange={setStreamTags}
                language={language}
                onLanguageChange={setLanguage}
                isMature={isMature}
                onMatureChange={setIsMature}
              />
              <div className="flex items-center gap-3">
                <Button
                  disabled={!dirty || updateInfo.isPending}
                  onClick={() =>
                    updateInfo.mutate({
                      title: title.trim(),
                      category: category.trim(),
                      streamTags,
                      // Back to null, not "": the column distinguishes "not
                      // stated" from a language, and the API must be able to
                      // say so.
                      language: language || null,
                      isMature,
                    })
                  }
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
          </div>
          {/* The right rail is the "what is happening right now" column: chat
              first (a streamer reads it constantly), activity under it. Both
              poll faster while live — off-air the same cadence is pure cost. */}
          <PanelRail userId={userId} isLive={isLive} hasChatRoom={!!stream?.chatRoomArn} />
        </div>
        </>
      )}
    </div>
  );
}
