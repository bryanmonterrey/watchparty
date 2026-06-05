"use client";

export function PostCardSkeleton({ withMedia = false }: { withMedia?: boolean }) {
    return (
        <div className="flex flex-row items-start gap-3 px-4 py-3 border-b border-flexwhite/15">
            {/* Avatar */}
            <div className="w-10 h-10 rounded-full shrink-0 mt-0.5 shimmer-skeleton" />

            <div className="flex-1 min-w-0 flex flex-col gap-2.5">
                {/* Header: name + handle + menu */}
                <div className="flex items-center justify-between pt-0.5">
                    <div className="flex items-center gap-2">
                        <div className="h-4 w-28 rounded-full shimmer-skeleton" />
                        <div className="h-4 w-20 rounded-full shimmer-skeleton" />
                    </div>
                    <div className="h-4 w-12 rounded-full shimmer-skeleton" />
                </div>

                {/* Content lines */}
                <div className="h-4 w-5/6 rounded-full shimmer-skeleton" />
                <div className="h-4 w-4/5 rounded-full shimmer-skeleton" />

                {/* Media */}
                {withMedia && (
                    <div className="aspect-video w-full rounded-2xl shimmer-skeleton" />
                )}

                {/* Actions row */}
                <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-24">
                        {[1, 2, 3, 4].map((i) => (
                            <div key={i} className="h-4 w-8 rounded-full shimmer-skeleton" />
                        ))}
                    </div>
                    <div className="h-4 w-12 rounded-full shimmer-skeleton" />
                </div>
            </div>
        </div>
    );
}
