"use client";

import * as React from "react";
import Link from "next/link";

import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";

// Go live, from anywhere in the studio (S6: "Go live as a persistent control
// in the shell"). Going live is the studio's one irreversible-feeling action
// and it lived on a single card inside /studio/streams — so starting a
// broadcast meant navigating first, and ending one from the Analytics page
// meant navigating back.
//
// It shares `stream.getMine` with the cockpit, so mounting it costs no extra
// request: same query key, same cache entry, and the mutation invalidates once
// for both.
//
// UNPROVISIONED CREATORS GET A LINK, NOT A DISABLED BUTTON. Without an ingest
// there is nothing to go live WITH, and the fix (generate a stream key) lives
// on the Streams page — so the control routes there rather than sitting greyed
// out with no way to explain itself.

export function GoLiveButton({ className }: { className?: string }) {
    const utils = trpc.useUtils();
    const mine = trpc.stream.getMine.useQuery(undefined, { staleTime: 20_000 });
    // INGEST state, which is not the same as published state: this is whether
    // IVS can see the encoder. Polled, because the answer changes the moment
    // the creator presses Start in OBS and they should not have to reload to
    // find that out.
    const live = trpc.stream.liveInfo.useQuery(undefined, { refetchInterval: 15_000, staleTime: 10_000 });
    const setLive = trpc.stream.setLiveStatus.useMutation({
        onSuccess: () => {
            void utils.stream.getMine.invalidate();
            void utils.stream.liveInfo.invalidate();
        },
    });

    const stream = mine.data;
    const provisioned = !!stream?.serverUrl && !!stream?.streamKey;
    const isLive = !!stream?.isLive;
    const ingesting = !!live.data?.isLive;

    if (mine.isPending) {
        return <div className={`h-9 animate-pulse rounded-lg bg-muted/30 ${className ?? ""}`} />;
    }

    if (!provisioned) {
        return (
            <Link
                href="/studio/streams"
                className={`flex h-9 items-center justify-center gap-2 rounded-lg border border-border/60 px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/50 ${className ?? ""}`}
            >
                Set up your stream
            </Link>
        );
    }

    // Not disabled-and-silent: a dead button teaches nothing. It stays
    // clickable-looking until the encoder is seen, and the label says what is
    // missing. (The server refuses it too — this is the explanation, not the
    // enforcement.)
    if (!isLive && !ingesting) {
        return (
            <div
                title="Press Start Streaming in OBS. The button arms itself when we see your encoder."
                className={`flex h-9 items-center justify-center gap-2 rounded-lg border border-border/60 px-3 text-xs text-muted-foreground ${className ?? ""}`}
            >
                <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                Waiting for OBS
            </div>
        );
    }

    return (
        <Button
            size="sm"
            variant={isLive ? "destructive" : "default"}
            disabled={setLive.isPending}
            onClick={() => setLive.mutate({ isLive: !isLive })}
            className={`h-9 w-full gap-2 ${className ?? ""}`}
        >
            {isLive ? (
                <>
                    <span className="size-1.5 animate-pulse rounded-full bg-current" />
                    {setLive.isPending ? "Ending…" : "End stream"}
                </>
            ) : (
                <>{setLive.isPending ? "Going live…" : "Go live"}</>
            )}
        </Button>
    );
}
