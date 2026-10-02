import { PlayerSpinner } from "@/components/video/player-loading";

// The instant shell for /home — the first thing a navigation paints.
//
// It exists because /home's client chunks (the (rails) group mounts AlertsRail,
// the deliberately-heavy import) take real time to arrive, and until they do a
// navigation would otherwise hold the OLD page. Served in the RSC payload, this
// needs no client chunk at all — see the history in the 8/20 nav-freeze work.
//
// EVERY box here mirrors what the mounted page paints WHILE ITS QUERIES LOAD,
// not a generic skeleton — otherwise the navigation shows two different
// loading states in a row (owner: "looks like /home has more than 1 loading
// state"). The mounted loading frame is:
//   · hero — HomeHero renders PlayerLoadingOverlay: BLACK with the ytp
//     spinner, never a grey shimmer (player-loading.tsx's own rule: a black
//     frame promises a video, a grey block promises a layout). The spinner is
//     reused directly — the file is server-safe.
// That is all of it since 2026-10-02: /home opens EXPANDED, where the tabs and
// the coin board are not mounted. (This shell drew both until then.) Someone
// who has collapsed the view sees the tabs appear on landing — the minority
// case, and the cost of a shell that cannot read localStorage.
export default function HomeLoading() {
    // ONLY the page slot. This renders INSIDE the (rails) layout, which
    // already draws the real left rail beside it — a rail spacer here would
    // double-count and shove the centre column 18rem right.
    return (
        <div className="flex min-h-screen w-full min-w-0">
                {/* THE COLUMN'S CLASSES ARE THE MOUNTED PAGE'S, VERBATIM — copy
                    the <main> in home-page-surface.tsx, do not paraphrase it.
                    The shell and the page are two paints of one column, and
                    every place their widths were allowed to differ has shown
                    up as the skeleton visibly resizing:
                    · the collapsed-rail swap (628 -> 872) has to be here, or
                      arriving from /coin with the rail collapsed the shell sat
                      narrow and jumped when the page landed;
                    · it has to be scoped max-xl:, because at xl the page's
                      column is flex-1 with NO cap — an unscoped group-has
                      rule outranks the plain xl: classes on specificity and
                      would pin the shell at 872 while the page takes the
                      row's slack, so the skeleton grew again on landing. */}
                <main className="relative ml-7 flex w-full min-w-0 max-w-[628px] flex-col md:mt-[var(--header-height)] max-xl:group-has-[[data-rail-collapsed=true]]/rails:max-w-[872px] xl:max-w-none xl:flex-1">
                    <div aria-hidden>
                        {/* Hero: the same black frame + spinner the mounted
                            HomeHero shows while the feed query loads, at the
                            EXPANDED size — home-center-column.tsx opens
                            expanded by default (HERO_BASE + HERO_EXPANDED,
                            copied verbatim; keep them in step). Nothing is
                            drawn under it: expanded, the tabs and the coin
                            board are unmounted, and the video header only
                            exists once there is a video to describe. */}
                        <div className="relative flex aspect-video w-full min-h-[calc(100svh-var(--header-height)-6.5rem)] items-center justify-center bg-black">
                            <PlayerSpinner />
                        </div>
                    </div>
                </main>
                {/* The right-hand columns, at the page's own widths, because
                    at xl the centre is flex-1 and takes whatever they leave:
                    the video rail (ml-7 w-96, no mr-auto — the page's aside
                    has none either) and the action dock, which mounts
                    EXPANDED by default at pl-2 + size-15 + pr-1 = 72px. Leave
                    the dock out and the shell's column is 72px wider than the
                    page's, and shrinks on landing. */}
                <div className="ml-7 hidden w-96 shrink-0 xl:block" aria-hidden />
                <div className="hidden w-18 shrink-0 xl:block" aria-hidden />
        </div>
    );
}
