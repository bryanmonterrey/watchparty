// Shared loader for the Amazon IVS player UMD script (window.IVSPlayer —
// global type declared in components/streaming/stream-viewer.tsx). Promise is
// cached so the stream pages and the mini player share one script tag.
const IVS_PLAYER_SRC = "https://player.live-video.net/1.29.0/amazon-ivs-player.min.js";

let loadPromise: Promise<void> | null = null;

export function loadIvsPlayer(): Promise<void> {
    if (typeof window === "undefined") return Promise.resolve();
    if (window.IVSPlayer) return Promise.resolve();
    if (!loadPromise) {
        loadPromise = new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = IVS_PLAYER_SRC;
            script.onload = () => resolve();
            script.onerror = () => {
                loadPromise = null;
                reject(new Error("IVS player script failed to load"));
            };
            document.head.appendChild(script);
        });
    }
    return loadPromise;
}
