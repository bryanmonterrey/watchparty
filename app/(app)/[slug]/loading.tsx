// Route-level skeleton for /[slug] — mirrors UserProfile's full-header layout
// (banner → overlapping avatar → name/actions → meta rows → tabs) so the real
// page swaps in without any layout jump.
export default function SlugLoading() {
    return (
        <div className="min-h-screen">
            {/* Banner */}
            <div className="shimmer-skeleton h-[320px] w-full" />

            <div className="relative z-30 mx-auto -mt-34 w-full max-w-[1400px] px-8">
                <div className="flex flex-col items-start justify-start space-y-1.5">
                    {/* Avatar */}
                    <div className="shimmer-skeleton size-40 rounded-full border-[6px] border-black" />

                    <div className="flex w-full max-w-2xl flex-col gap-3 pt-1">
                        {/* Name + action pills */}
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="shimmer-skeleton h-9 w-52 rounded-full" />
                            <div className="flex items-center gap-2">
                                <div className="shimmer-skeleton size-11 rounded-full" />
                                <div className="shimmer-skeleton size-11 rounded-full" />
                                <div className="shimmer-skeleton h-11 w-24 rounded-full" />
                                <div className="shimmer-skeleton h-11 w-28 rounded-full" />
                            </div>
                        </div>

                        {/* @username + level bar + badges */}
                        <div className="flex items-center gap-2.5">
                            <div className="shimmer-skeleton h-4 w-24 rounded-full" />
                            <div className="shimmer-skeleton h-4 w-32 rounded-full" />
                        </div>

                        {/* Bio */}
                        <div className="flex flex-col gap-1.5">
                            <div className="shimmer-skeleton h-4 w-full max-w-md rounded-full" />
                            <div className="shimmer-skeleton h-4 w-2/3 max-w-sm rounded-full" />
                        </div>

                        {/* Location · joined · link */}
                        <div className="flex items-center gap-5">
                            <div className="shimmer-skeleton h-4 w-24 rounded-full" />
                            <div className="shimmer-skeleton h-4 w-32 rounded-full" />
                            <div className="shimmer-skeleton h-4 w-28 rounded-full" />
                        </div>

                        {/* Following / Followers */}
                        <div className="flex items-center gap-5">
                            <div className="shimmer-skeleton h-4 w-24 rounded-full" />
                            <div className="shimmer-skeleton h-4 w-24 rounded-full" />
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="mt-5 flex gap-9 pb-3">
                    {[16, 20, 14, 16, 18, 16, 18].map((w, i) => (
                        <div key={i} className="shimmer-skeleton h-4 rounded-full" style={{ width: w * 4 }} />
                    ))}
                </div>
            </div>
        </div>
    );
}
