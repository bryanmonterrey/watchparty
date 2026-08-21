"use client";

import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from "react";

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
    /**
     * Keep the saved resume point fresh. Deliberately NOT state — the player
     * calls this several times a second, and every (app) consumer of this
     * context (the home hero, the watch page) would re-render on each one.
     */
    noteProgress: (time: number) => void;
}

const MiniPlayerContext = createContext<MiniPlayerContextValue | null>(null);

// sessionStorage, not localStorage, on purpose: a mini player belongs to the
// tab it was opened in. Two tabs each get their own, and closing the tab ends
// it rather than resurrecting a video days later.
const STORAGE_KEY = "wp:mini-player";

function readStored(): MiniPlayerData | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = window.sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as MiniPlayerData;
        // A stored blob with no source can't produce a player, and postId is
        // what every "this video is in the mini player" check compares on.
        if (!parsed?.postId || !parsed?.videoUrl) return null;
        return { ...parsed, startTime: Number(parsed.startTime) || 0 };
    } catch {
        return null;
    }
}

function writeStored(data: MiniPlayerData | null) {
    if (typeof window === "undefined") return;
    try {
        if (data) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        else window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // Private mode / quota — persistence is a nicety, never a hard failure.
    }
}

export function MiniPlayerProvider({ children }: { children: React.ReactNode }) {
    const [miniPlayerData, setMiniPlayerData] = useState<MiniPlayerData | null>(null);

    // The live resume point, mirrored out of React so progress writes cost
    // nothing. `dataRef` is what the throttled writer re-serialises against.
    const dataRef = useRef<MiniPlayerData | null>(null);
    const lastWriteRef = useRef(0);

    // Rehydrate in an effect rather than in the useState initialiser: this
    // provider renders on the server, and reading sessionStorage during the
    // first client render would make the watch page and home hero disagree
    // with their own SSR output (they branch on miniPlayerData).
    //
    // This is also what carries the player ACROSS ROUTE GROUPS — (app) and
    // (studio)/(legal)/(directory)/(developer) each mount their own provider,
    // so moving between them is a remount, and the rehydrate is the handoff.
    useEffect(() => {
        const stored = readStored();
        if (!stored) return;
        dataRef.current = stored;
        setMiniPlayerData(stored);
    }, []);

    const enterMiniPlayer = useCallback((data: MiniPlayerData) => {
        dataRef.current = data;
        writeStored(data);
        setMiniPlayerData(data);
    }, []);

    const exitMiniPlayer = useCallback(() => {
        dataRef.current = null;
        writeStored(null);
        setMiniPlayerData(null);
    }, []);

    const noteProgress = useCallback((time: number) => {
        const current = dataRef.current;
        if (!current || !Number.isFinite(time)) return;
        current.startTime = time;
        // Once a second is plenty for a resume point and keeps `timeupdate`
        // (roughly 4Hz) off the JSON-serialise-plus-storage-write path.
        const now = performance.now();
        if (now - lastWriteRef.current < 1000) return;
        lastWriteRef.current = now;
        writeStored(current);
    }, []);

    // A tab being closed or hidden is the last chance to record where the
    // video actually got to, since the throttle above may be mid-window.
    useEffect(() => {
        const flush = () => {
            if (dataRef.current) writeStored(dataRef.current);
        };
        window.addEventListener("pagehide", flush);
        document.addEventListener("visibilitychange", flush);
        return () => {
            window.removeEventListener("pagehide", flush);
            document.removeEventListener("visibilitychange", flush);
        };
    }, []);

    // Memoised so the only thing that re-renders a consumer is the player
    // opening or closing — never a progress tick, which never touches state.
    const value = useMemo(
        () => ({ miniPlayerData, enterMiniPlayer, exitMiniPlayer, noteProgress }),
        [miniPlayerData, enterMiniPlayer, exitMiniPlayer, noteProgress],
    );

    return <MiniPlayerContext.Provider value={value}>{children}</MiniPlayerContext.Provider>;
}

export function useMiniPlayer() {
    const ctx = useContext(MiniPlayerContext);
    if (!ctx) throw new Error("useMiniPlayer must be used within MiniPlayerProvider");
    return ctx;
}
