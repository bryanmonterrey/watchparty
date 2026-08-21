"use client";

import dynamic from "next/dynamic";
import { MiniPlayerProvider, useMiniPlayer } from "@/contexts/mini-player-context";

// Lazy: the player chunk isn't downloaded until a video actually enters
// mini-player mode, so every (app) page can host the shell without paying
// for the video player up front (the speed rule).
const GlobalMiniPlayer = dynamic(
    () => import("@/components/video/global-mini-player").then((m) => m.GlobalMiniPlayer),
    { ssr: false }
);

function LazyMiniPlayer() {
    const { miniPlayerData } = useMiniPlayer();
    if (!miniPlayerData) return null;
    return <GlobalMiniPlayer />;
}

// Mounted in (app)/layout.tsx and, so the player survives the walk out of the
// app, in (studio), (legal), (directory) and (developer) too.
//
// WITHIN a group the provider instance is the same across route changes, so the
// <video> element is never remounted and playback is genuinely continuous.
// BETWEEN groups each layout mounts its own provider, so the crossing is a
// remount and the handoff is the sessionStorage rehydrate in
// mini-player-context — same video, resumed at its saved timestamp, but it
// re-buffers and (no user gesture) comes back paused.
//
// Deliberately NOT in (auth) or (marketing): the login and landing pages stay
// bare, and the root layout stays bare too (the speed rule).
//
// Cross-SUBDOMAIN navigation can't be covered by any of this. studio. and
// console. are separate origins with their own sessionStorage, so a mini player
// only crosses into the studio via watchparty.xyz/studio, not
// studio.watchparty.xyz.
export function MiniPlayerShell({ children }: { children: React.ReactNode }) {
    return (
        <MiniPlayerProvider>
            {children}
            <LazyMiniPlayer />
        </MiniPlayerProvider>
    );
}
