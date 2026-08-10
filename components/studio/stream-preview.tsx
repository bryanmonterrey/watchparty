"use client";

import * as React from "react";

// Lean stream preview for the studio cockpit — the creator's own monitor.
// Loads the AWS IVS player from its CDN (a script tag, no bundle cost — the
// same approach as components/streaming/stream-player.tsx) and plays the
// channel's own playbackUrl, muted. Deliberately minimal: no chat, ambient
// glow, ads, or lucide (the viewer player carries those; the studio stays
// lean). window.IVSPlayer is typed globally in stream-viewer.tsx.

const IVS_SCRIPT = "https://player.live-video.net/1.29.0/amazon-ivs-player.min.js";

function useIvsScript(): boolean {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    if (window.IVSPlayer) {
      setReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${IVS_SCRIPT}"]`);
    const onLoad = () => setReady(!!window.IVSPlayer);
    if (existing) {
      existing.addEventListener("load", onLoad);
      return () => existing.removeEventListener("load", onLoad);
    }
    const script = document.createElement("script");
    script.src = IVS_SCRIPT;
    script.async = true;
    script.addEventListener("load", onLoad);
    document.body.appendChild(script);
    return () => script.removeEventListener("load", onLoad);
  }, []);
  return ready;
}

export function StreamPreview({ playbackUrl, isLive }: { playbackUrl: string | null; isLive: boolean }) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const ready = useIvsScript();
  const canPlay = ready && isLive && !!playbackUrl;

  React.useEffect(() => {
    if (!canPlay || !window.IVSPlayer?.isPlayerSupported || !videoRef.current) return;
    const player = window.IVSPlayer.create();
    player.attachHTMLVideoElement(videoRef.current);
    player.load(playbackUrl!);
    player.play();
    return () => {
      try {
        player.pause();
        player.delete();
      } catch {
        /* player already torn down */
      }
    };
  }, [canPlay, playbackUrl]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-black">
      <div className="relative aspect-video w-full">
        {canPlay ? (
          <video ref={videoRef} muted playsInline className="size-full object-contain" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <span className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/60">
              {isLive ? "Connecting to your stream…" : "Offline"}
            </span>
          </div>
        )}
        {canPlay ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full bg-red-500/90 px-2 py-0.5 text-xs font-medium text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" />
            Live
          </span>
        ) : null}
      </div>
    </div>
  );
}
