"use client";

import { MiniPlayerProvider } from "@/contexts/mini-player-context";
import { GlobalMiniPlayer } from "@/components/video/global-mini-player";

export function MiniPlayerShell({ children }: { children: React.ReactNode }) {
    return (
        <MiniPlayerProvider>
            {children}
            <GlobalMiniPlayer />
        </MiniPlayerProvider>
    );
}
