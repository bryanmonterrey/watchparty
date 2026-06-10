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

// Mounted once in (app)/layout.tsx — the provider survives route changes, so
// a mini player opened on a watch page keeps playing on every other page.
export function MiniPlayerShell({ children }: { children: React.ReactNode }) {
    return (
        <MiniPlayerProvider>
            {children}
            <LazyMiniPlayer />
        </MiniPlayerProvider>
    );
}
