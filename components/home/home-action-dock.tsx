"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeftDoubleIcon, ArrowRightDoubleIcon } from "@hugeicons/core-free-icons";
import { BookmarkIcon, MessagesIcon, Star2Icon } from "@/components/icons";
import { Squircle } from "@/components/ui/squircle";
import { trpc } from "@/lib/trpc/client";

// Home's 4th column: a narrow gutter to the right of the video rail whose only
// job is to park the app's two round-the-clock actions at the bottom of the
// viewport.
//
// It's a real column, not a `fixed` overlay, on purpose — the buttons sit in
// the flex row so they can never land on top of the rail's content, and the
// width they take comes out of the centre column (which is `flex-1`) while the
// video rail keeps its w-75.
//
// Sticky rather than fixed for the same reason as the two rails: the page
// scrolls inside #app-scroll-container, so `fixed` would anchor to the window
// and drift out of the column it belongs to.
//
// Collapsed is persisted, like the left rail's: a dock you shut should stay
// shut across navigations and reloads, or the chevron feels like it did nothing.

const STORAGE_KEY = "wp:home:dock:collapsed";

// Mirrors the rails on either side — the dock pins at the scroller's top and
// its own height is what pushes the buttons down to the bottom edge.
const INNER = "sticky top-0 flex h-screen flex-col items-center justify-end pb-4";

// Squircled, not pills: these are surfaces with an icon in them, not text
// buttons. Depth is the flat fill + a hairline (autoEffects keeps the border
// alive under the clip-path) — never a drop shadow.
//
// The /50 on border-flexwhite is inert, by design: globals.css remaps every
// [class*="border-flexwhite"] to var(--wp-border), so this renders as the
// app-wide slate hairline like every other neutral border. Kept as-is rather
// than routed around — the whole point of that remap is that borders don't
// drift per surface.
const BUTTON =
    "flex size-15 cursor-pointer items-center justify-center border border-flexwhite/10 bg-canvas text-zinc-300 transition-colors hover:bg-soft-gray-20 hover:text-white";

const BUTTON_RADIUS = 16;

// White halo. It goes through Lisse's `shadow` prop rather than a CSS
// box-shadow class because the buttons are clip-path'd — a box-shadow is part
// of the element's own rendering, so the clip would cut it off flush at the
// squircle's edge and nothing would escape. Lisse draws it as an SVG
// drop-shadow that traces the same curve instead.
//
// Even halo, so no offset: this is a glow, not an elevation cue (the app's
// rule is no gray/black drop shadows, and a lit edge is the sanctioned way to
// lift something off the canvas).
const BUTTON_GLOW = { offsetX: 0, offsetY: 0, blur: 3, spread: 0, color: "#ffffff", opacity: 0.25 };

// Positioning context for the unread badge, sized to the button rather than
// left to shrink-wrap it: Lisse's autoEffects injects a wrapper div between
// this and the button, and an auto-width parent + a 100%-width wrapper is
// exactly the case that resolves inconsistently. Pinning it removes the
// question — the badge always anchors to the button's real corner.
const SLOT = "relative size-15";

// The collapse/expand chevron is chrome, not an action — bare icon, same
// padding and size as the left rail's so the two rails' controls match.
const CHEVRON = "flex cursor-pointer items-center px-1.5 py-1.5 text-zinc-500 transition-colors hover:text-white";

function UnreadBadge({ count }: { count: number }) {
    if (count <= 0) return null;
    return (
        // Rendered OUTSIDE the squircle, as a sibling of it: clip-path clips
        // descendants, so a badge hung off the button's own corner would be
        // sliced in half. ring-canvas, not a border — it has to read as a gap
        // punched out of the page behind it.
        <span className="pointer-events-none absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-notification px-1 text-[10px] font-bold tabular-nums text-white ring-2 ring-canvas">
            {count > 99 ? "99+" : count}
        </span>
    );
}

export function HomeActionDock() {
    const [collapsed, setCollapsed] = useState(false);

    // The (app) layout guards the session server-side, so this is always a
    // signed-in read. Same 30s cadence as the sidebar's unread dot.
    const { data: unread } = trpc.conversation.getUnreadCount.useQuery(undefined, {
        refetchInterval: 30_000,
    });
    const count = unread?.count ?? 0;

    // After mount, never during render — the app shell server-renders, and
    // reading localStorage in render would be a hydration mismatch.
    useEffect(() => {
        try {
            setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
        } catch {
            // storage disabled — expanded is the right default
        }
    }, []);

    const set = (next: boolean) => {
        setCollapsed(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch { /* not worth failing the toggle over */ }
    };

    if (collapsed) {
        return (
            <aside className="hidden w-9 shrink-0 xl:block">
                <div className={INNER}>
                    <button
                        type="button"
                        onClick={() => set(false)}
                        aria-label="show dock"
                        className={CHEVRON}
                    >
                        <HugeiconsIcon icon={ArrowLeftDoubleIcon} className="size-6" strokeWidth={2} />
                    </button>
                </div>
            </aside>
        );
    }

    return (
        <aside className="hidden pl-2 pr-1 shrink-0 xl:block">
            <div className={`${INNER} gap-2.5`}>
                <button
                    type="button"
                    onClick={() => set(true)}
                    aria-label="hide dock"
                    className={CHEVRON}
                >
                    <HugeiconsIcon icon={ArrowRightDoubleIcon} className="size-6" strokeWidth={2} />
                </button>

                {/* AI is the first button under the chevron — the top of the
                    stack on every page this dock renders on, which is home and
                    /feed. Order lives here, in the shared component, so the two
                    can't disagree.

                    TODO: opens the GLM assistant panel — see docs/TODO.md.
                    Inert until that surface exists. */}
                <div className={SLOT}>
                    <Squircle asChild radius={BUTTON_RADIUS} shadow={BUTTON_GLOW}>
                        <button type="button" aria-label="ask ai" className={BUTTON}>
                            <Star2Icon className="size-6.5" />
                        </button>
                    </Squircle>
                </div>

                {/* Bookmarks. Its only entry point used to be the discover
                    rail's user chip, which stopped rendering when /feed took
                    home's frame — the route stayed reachable but nothing linked
                    to it. It belongs here rather than back in a rail: the dock
                    is the app-wide gutter, so it's the same one click from home
                    and from the feed. */}
                <div className={SLOT}>
                    <Squircle asChild radius={BUTTON_RADIUS} shadow={BUTTON_GLOW}>
                        <Link href="/feed/bookmarks" aria-label="bookmarks" className={BUTTON}>
                            <BookmarkIcon className="size-6" />
                        </Link>
                    </Squircle>
                </div>

                <div className={SLOT}>
                    <Squircle asChild radius={BUTTON_RADIUS} shadow={BUTTON_GLOW}>
                        <Link href="/messages" aria-label="messages" className={BUTTON}>
                            <MessagesIcon className="size-7" />
                        </Link>
                    </Squircle>
                    <UnreadBadge count={count} />
                </div>
            </div>
        </aside>
    );
}
