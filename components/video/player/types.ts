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
    loop?: boolean;
    chapters?: Chapter[];
    progressDots?: ProgressDot[];
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
