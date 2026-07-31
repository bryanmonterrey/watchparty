import { PlayerLoadingOverlay } from "@/components/video/player-loading";

/** Stable Shorts geometry used for both chunk loading and the first feed query. */
export function ShortsFeedLoading() {
    return (
        <div className="relative flex h-full w-full items-center justify-center gap-4 bg-canvas px-4 py-2">
            <div className="relative z-10 h-full shrink-0 aspect-[9/16] overflow-hidden bg-black sm:rounded-2xl">
                <PlayerLoadingOverlay />
            </div>

            <div className="relative z-20 flex h-full shrink-0 flex-col items-center justify-end gap-3 px-2 pb-4 lg:px-4">
                <div className="size-14 rounded-full shimmer-skeleton" />
                {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="flex flex-col items-center gap-1">
                        <div className="size-16 rounded-2xl shimmer-skeleton" />
                        <div className="h-2.5 w-8 rounded-full shimmer-skeleton" />
                    </div>
                ))}
            </div>
        </div>
    );
}
