import { PostCardSkeleton } from "./post-card-skeleton";

// The feed's loading frame — one definition, three moments that must look
// IDENTICAL so a navigation reads as a single loading state instead of a
// skeleton relay:
//
// - app/(app)/(rails)/feed/loading.tsx — the navigation's instant shell,
//   served in the RSC payload (which is why this file and everything it
//   imports must stay server-safe: no "use client", no hooks);
// - the dynamic() fallback while the BrowseFeed chunk parses (DiscoverClient
//   and home's feed overlay);
// - BrowseFeed's own query-loading render, which paints the SAME
//   PostCardSkeleton rows under its real tab bar.
//
// So the frame here mirrors BrowseFeed's render exactly: its tab bar (same
// h-13, same labels, same active underline — static, since nothing is
// clickable until the real bar hydrates over it) and the same 7 skeleton
// cards with media on the odd rows (browse-feed.tsx uses i % 2 === 1). When
// the real component lands, every box is already in place and only the tab
// bar becomes interactive — nothing visibly changes.
export function FeedSurfaceLoading() {
    return (
        <div className="flex flex-col bg-canvas">
            <div className="flex w-full items-center border-b border-soft-gray/[0.12] bg-canvas">
                {/* FeedTab's geometry: the invisible leading spacer mirrors the
                    chevron so the label centres exactly where the real tab
                    puts it — without it the text jumps ~12px on hydration. */}
                <div className="flex h-13 w-fit flex-1 items-center justify-center bg-canvas">
                    <span aria-hidden className="ml-1 size-5 opacity-0" />
                    <div className="relative flex h-full items-center">
                        <span className="text-[15px] font-bold text-zinc-100">For you</span>
                        {/* The chevron the real tab renders, as inline SVG so
                            the shell stays chunk-free. */}
                        <span className="ml-1 flex items-center text-zinc-500">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden>
                                <path d="m6 9 6 6 6-6" />
                            </svg>
                        </span>
                        <span className="absolute inset-x-0 bottom-0 h-[4px] rounded-full bg-twitter2" />
                    </div>
                </div>
                <div className="flex h-13 w-fit flex-1 items-center justify-center bg-canvas">
                    <span className="text-[15px] font-bold text-zinc-500">Following</span>
                </div>
            </div>
            {/* The collapsed composer's frame (post-composer.tsx): p-4, the
                10-avatar, and its real placeholder line — the mounted composer
                shows exactly this, so nothing shifts when it hydrates in. */}
            <div className="flex gap-4 border-b border-soft-gray/[0.12] bg-canvas p-4">
                <div className="size-10 shrink-0 rounded-full shimmer-skeleton" />
                <div className="flex flex-1 items-center">
                    <span className="text-xl text-zinc-400/85">What&apos;s happening?</span>
                </div>
            </div>
            {Array.from({ length: 7 }).map((_, index) => (
                <PostCardSkeleton key={index} withMedia={index % 2 === 1} />
            ))}
        </div>
    );
}
