// ── Constants ────────────────────────────────────────────────────────────────
export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export const store = {
    get: (key: string, fallback: string) =>
        typeof window !== "undefined" ? (localStorage.getItem(key) ?? fallback) : fallback,
    set: (key: string, value: string) => {
        if (typeof window !== "undefined") localStorage.setItem(key, value);
    },
};

// ── Types ────────────────────────────────────────────────────────────────────
export interface Chapter {
    title: string;
    startTime: number;
    endTime: number;
}

export interface ProgressDot {
    time: number;
    label?: string;
}

export interface Marker {
    time: number;
    label?: string;
}

export type BezelIcon = "play" | "pause" | "forward" | "back";
export type OpenMenu = "settings" | "subtitles" | null;

export interface VideoPlayerProps {
    postId: string;
    title?: string | null;
    videoUrl?: string | null;
    thumbnailUrl?: string | null;
    isLoading?: boolean;
    /** Starting value for the loop toggle. Omitted, the user's stored choice wins. */
    loop?: boolean;
    chapters?: Chapter[];
    progressDots?: ProgressDot[];
    /**
     * Fill the parent box instead of imposing 16:9. For a slot that already owns
     * its size — the home hero's screen, which grows past 16:9 in focus mode.
     */
    fill?: boolean;
    /**
     * Start playing on mount. Muted first, because that is the only autoplay a
     * browser allows without a gesture; `audioBus` is what brings the sound back.
     */
    autoPlay?: boolean;
    /** Runs after the player's own end handling — the home hero advances its queue with it. */
    onEnded?: () => void;
    /**
     * Join the page-wide audio bus (`lib/audio-bus`): claim the page's audio on
     * mount, mute whenever something else claims it, take it back when that
     * thing lets go. The home hero opts in because the cards around it preview
     * audio on hover.
     */
    audioBus?: boolean;
    /**
     * A surface someone landed on rather than chose: no view counted, no
     * heatmap recorded, no watch progress saved or resumed. The home hero, whose
     * videos autoplay by themselves, would otherwise mark the whole feed watched.
     */
    transient?: boolean;
    /**
     * Theater mode as a CONTROLLED value, for a host that owns the layout the
     * button changes (home's focus mode). Left undefined the player keeps its own
     * state, which is what the watch page wants.
     */
    theaterMode?: boolean;
    onTheaterModeChange?: (isTheater: boolean) => void;
    onBeforePlay?: () => Promise<void> | void;
    hiddenControls?: Array<"pip" | "theater" | "subtitles" | "settings" | "autoplay" | "airplay">;
    isMiniPlayer?: boolean;
    onEnterMiniPlayer?: (currentTime: number) => void;
    onMiniPlayerClose?: () => void;
    onMiniPlayerExpand?: () => void;
    onMiniPlayerDragStart?: (e: React.PointerEvent) => void;
    // Ads — pass a VAST/VMAP tag URL to enable pre/mid/post-roll via Google IMA SDK
    adTagUrl?: string | null;
    // VTT thumbnail sprite sheets — one or more URLs, sorted smallest to largest quality
    // e.g. ["https://cdn.example.com/thumbs-120p.vtt", "https://cdn.example.com/thumbs-480p.vtt"]
    thumbnailVttUrls?: string | string[] | null;
    // Named markers on the timeline (e.g. key moments, chapter points, ads)
    markers?: Marker[];
    // Video cards (interactive overlays)
    showCards?: boolean;
}
