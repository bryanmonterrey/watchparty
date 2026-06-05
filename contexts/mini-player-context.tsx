"use client";

import { createContext, useContext, useState, useCallback } from "react";

export interface MiniPlayerData {
    postId: string;
    videoUrl: string;
    thumbnailUrl?: string | null;
    title?: string | null;
    author?: string | null;
    startTime: number;
    watchUrl: string;
}

interface MiniPlayerContextValue {
    miniPlayerData: MiniPlayerData | null;
    enterMiniPlayer: (data: MiniPlayerData) => void;
    exitMiniPlayer: () => void;
}

const MiniPlayerContext = createContext<MiniPlayerContextValue | null>(null);

export function MiniPlayerProvider({ children }: { children: React.ReactNode }) {
    const [miniPlayerData, setMiniPlayerData] = useState<MiniPlayerData | null>(null);
    const enterMiniPlayer = useCallback((data: MiniPlayerData) => setMiniPlayerData(data), []);
    const exitMiniPlayer = useCallback(() => setMiniPlayerData(null), []);

    return (
        <MiniPlayerContext.Provider value={{ miniPlayerData, enterMiniPlayer, exitMiniPlayer }}>
            {children}
        </MiniPlayerContext.Provider>
    );
}

export function useMiniPlayer() {
    const ctx = useContext(MiniPlayerContext);
    if (!ctx) throw new Error("useMiniPlayer must be used within MiniPlayerProvider");
    return ctx;
}
