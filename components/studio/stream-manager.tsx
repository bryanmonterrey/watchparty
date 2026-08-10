"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, ViewIcon, RefreshIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

// The studio's stream control centre. Everything a creator needs to go live
// lives here, driven by the existing stream.* procedures: getMine (config +
// live state), generateConnection (provision/reveal the IVS ingest + key),
// updateInfo (title/category), setLiveStatus (the manual live toggle, which
// also fires developer webhooks). Viewer-facing playback stays on the watch
// page; this is the broadcaster's cockpit.

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

export function StreamManager() {
  const utils = trpc.useUtils();
  // Poll while the studio is open so the live badge and viewer count stay warm.
  const mine = trpc.stream.getMine.useQuery(undefined, { refetchInterval: 20_000 });
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

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Streams</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your broadcast cockpit — go live, copy your ingest, and set what
            viewers see.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-500">
              <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
              Live · {stream?.viewerCount ?? 0}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-muted-foreground/50" />
              Offline
            </span>
          )}
        </div>
      </div>

      {mine.isPending ? (
        <div className="h-40 animate-pulse rounded-2xl border border-border/60 bg-muted/30" />
      ) : (
        <>
          {/* Go-live status card */}
          <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
            <p className="text-sm font-medium">
              {isLive ? "You're live" : provisioned ? "Ready to go live" : "Set up your stream"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isLive
                ? "Your channel is broadcasting. Ending here marks you offline for viewers."
                : provisioned
                  ? "Point your encoder at the ingest below and start sending. The live badge flips automatically when frames arrive — or flip it here."
                  : "Generate your ingest server and stream key, then point OBS or your encoder at them."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!provisioned ? (
                <Button
                  disabled={generate.isPending}
                  onClick={() => generate.mutate({ ingressType: "RTMP" })}
                >
                  {generate.isPending ? "Generating…" : "Generate stream key"}
                </Button>
              ) : isLive ? (
                <Button
                  variant="destructive"
                  disabled={setLive.isPending}
                  onClick={() => setLive.mutate({ isLive: false })}
                >
                  {setLive.isPending ? "Ending…" : "End stream"}
                </Button>
              ) : (
                <Button
                  disabled={setLive.isPending}
                  onClick={() => setLive.mutate({ isLive: true })}
                >
                  {setLive.isPending ? "Going live…" : "Go live"}
                </Button>
              )}
            </div>
            {generate.error ? (
              <p className="mt-2 text-xs text-destructive">{generate.error.message}</p>
            ) : null}
          </div>

          {/* Ingest credentials */}
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
                Paste these into OBS → Settings → Stream (Custom). Keep your
                stream key private — anyone with it can broadcast as you.
              </p>
              <div className="mt-3 flex flex-col gap-3">
                <CopyField label="Server URL" value={stream!.serverUrl!} />
                <CopyField label="Stream key" value={stream!.streamKey!} secret />
                {stream?.playbackUrl ? (
                  <CopyField label="Playback URL" value={stream.playbackUrl} />
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
                  onClick={() =>
                    updateInfo.mutate({ title: title.trim(), category: category.trim() })
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
        </>
      )}
    </div>
  );
}
