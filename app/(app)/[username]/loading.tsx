import { staggerPulse } from "@/lib/skeleton-stagger";

// Route-level skeleton for /[slug].
//
// It has to trace UserProfile's real geometry or the page jumps when the data
// lands, and the previous version traced a layout that no longer exists: a
// 320px banner (it's 176), a size-40 avatar overlapping it by -mt-34 (it's
// size-24 and sits BELOW the banner — only the compact header pulls up), and a
// centred max-w-[1400px] column (the page is a three-column channel layout with
// a sidebar-width rail left and a 340px rail right). Every one of those was a
// visible jolt on load.
//
// Numbers below are lifted from the components themselves — profile-banner
// (h-[176px]), profile-avatar (size-24 border-[6px]), user-profile (px-4 py-4,
// gap-6, px-8 py-4) and profile-tabs (mt-5, gap-9, six tabs).

/** Tab labels are different lengths; matching them keeps the rail from resizing. */
const TAB_WIDTHS = [44, 48, 62, 48, 52, 84];

export default function SlugLoading() {
    const pulse = (i: number) => staggerPulse(i, 10);

    return (
        <div className="relative flex min-h-screen w-full">
            {/* Left rail — empty in the real page too, so nothing to shim. */}
            <aside className="hidden w-[var(--sidebar-width)] shrink-0 lg:block" />

            <main className="relative min-w-0 flex-1">
                {/* Banner. bg-panel1 flat, exactly as ProfileBanner renders it —
                    no shimmer: it has no content to wait for. */}
                <div className="h-[176px] w-full bg-panel1" />

                <div className="relative z-30 w-full px-4 py-4">
                    <div className="flex flex-row items-start justify-start gap-6">
                        {/* Avatar */}
                        <div style={pulse(0)} className="size-24 shrink-0 rounded-full border-[6px] border-black shimmer-skeleton" />

                        <div className="flex min-w-0 flex-1 flex-row items-start justify-between gap-4">
                            <div className="flex min-w-0 flex-col gap-2">
                                {/* Name + @username row */}
                                <div className="flex items-center gap-2">
                                    <div style={pulse(1)} className="h-7 w-44 rounded-full shimmer-skeleton" />
                                    <div style={pulse(2)} className="h-5 w-28 rounded-full shimmer-skeleton opacity-70" />
                                </div>
                                {/* Followers / following */}
                                <div className="flex items-center gap-4">
                                    <div style={pulse(3)} className="h-4 w-24 rounded-full shimmer-skeleton" />
                                    <div style={pulse(4)} className="h-4 w-24 rounded-full shimmer-skeleton" />
                                </div>
                                {/* Bio */}
                                <div className="flex flex-col gap-1.5 pt-0.5">
                                    <div style={pulse(5)} className="h-4 w-full max-w-md rounded-full shimmer-skeleton" />
                                    <div style={pulse(6)} className="h-4 w-2/3 max-w-sm rounded-full shimmer-skeleton" />
                                </div>
                            </div>

                            {/* Action buttons — h-11, per the button standard. */}
                            <div className="hidden shrink-0 items-center gap-2 sm:flex">
                                <div style={pulse(7)} className="size-11 rounded-full shimmer-skeleton" />
                                <div style={pulse(8)} className="h-11 w-28 rounded-full shimmer-skeleton" />
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="mt-5 flex items-center gap-9 pb-3">
                        {TAB_WIDTHS.map((w, i) => (
                            <div key={i} style={{ ...pulse(i), width: w }} className="h-4 rounded-full shimmer-skeleton" />
                        ))}
                    </div>
                </div>

                {/* Tab content — the Home tab's hero + card row. */}
                <div className="w-full px-8 py-4">
                    <div style={pulse(9)} className="aspect-[16/6] w-full rounded-2xl shimmer-skeleton" />
                    <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-3">
                        {[0, 1, 2].map((i) => (
                            <div key={i} style={pulse(i + 4)} className="aspect-video w-full rounded-2xl shimmer-skeleton" />
                        ))}
                    </div>
                </div>
            </main>

            {/* Right rail */}
            <aside className="hidden w-[340px] shrink-0 xl:block" />
        </div>
    );
}
