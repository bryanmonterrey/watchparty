"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { UserType } from "@/db/schema/auth/user";
import { ProfileBanner } from "./profile-banner";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileHeader } from "./profile-header";
import { ProfileTabs, TABS } from "./profile-tabs";
import { ProfileTabContent } from "./profile-tab-content";
// ChannelChat (components/profile/channel-chat.tsx) was briefly a right rail
// here — pulled 2026-07-21 pending the chat redesign; re-add via an <aside>.
import { StreamWatchPage } from "@/components/streaming/stream-watch-page";
import { MaximizeIcon, MinimizeIcon } from "@/components/icons";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

// Resize toggle skin — sits right-aligned on the tabs row in both the full and
// compact headers. No fill at rest, just a hover background.
const resizeBtnClass = "flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-soft-gray-15 hover:text-zinc-100";

interface UserProfileProps {
    user: UserType;
    /** Server-fetched so the counts row renders with the rest of the header. */
    initialFollowCounts?: { followers: number; following: number };
    /** Resolved on the server at entry — see the live check in [slug]/page.tsx. */
    initialIsLive?: boolean;
}

export function UserProfile({ user, initialFollowCounts, initialIsLive }: UserProfileProps) {
    const [activeTab, setActiveTab] = useState(TABS[0]);
    // Live is a view of this page, not a page of its own (/<user>/live is gone).
    // Seeded from the server so a broadcasting host's page opens ON the stream
    // rather than painting the profile and swapping a beat later.
    const [showLive, setShowLive] = useState(!!initialIsLive);

    // Only polled for a host who WAS live at entry — a profile view shouldn't
    // cost an IVS lookup for the ~everyone who isn't streaming. It exists to
    // catch the stream ending while you're on the page.
    const { data: live } = trpc.stream.getViewers.useQuery(
        { userId: user.id },
        { enabled: !!initialIsLive, refetchInterval: 60_000, refetchIntervalInBackground: false },
    );
    const isLive = initialIsLive ? (live?.isLive ?? true) : false;
    const [isMinimized, setIsMinimized] = useState(false);
    const minimizedRef     = useRef(false);
    const buttonMinRef     = useRef(false);
    const fullRef          = useRef<HTMLDivElement>(null);
    const compactRef       = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const container = document.getElementById("app-scroll-container");
        if (!container) return;

        const onScroll = () => {
            if (!fullRef.current) return;
            const fullBottom =
                fullRef.current.getBoundingClientRect().bottom -
                container.getBoundingClientRect().top;

            if (!minimizedRef.current && fullBottom <= 200) {
                buttonMinRef.current = false;
                minimizedRef.current = true;
                setIsMinimized(true);
            } else if (minimizedRef.current && fullBottom > 200) {
                // Don't scroll-undo a button-minimize unless user is back at top
                if (!buttonMinRef.current || container.scrollTop <= 10) {
                    buttonMinRef.current = false;
                    minimizedRef.current = false;
                    setIsMinimized(false);
                }
            }
        };

        container.addEventListener("scroll", onScroll, { passive: true });
        return () => container.removeEventListener("scroll", onScroll);
    }, []);

    const handleToggle = () => {
        const container = document.getElementById("app-scroll-container");
        if (isMinimized) {
            buttonMinRef.current = false;
            minimizedRef.current = false;
            setIsMinimized(false);
            container?.scrollTo({ top: 0, behavior: "smooth" });
        } else {
            buttonMinRef.current = true;
            minimizedRef.current = true;
            setIsMinimized(true);
            container?.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    // Below every hook, so switching modes never changes the hook order.
    if (showLive) {
        return <StreamWatchPage host={user} onShowProfile={() => setShowLive(false)} />;
    }

    // Unconditional, both ways. It was gated on isLive — which meant clicking
    // your own name did nothing whenever you weren't broadcasting, i.e. almost
    // always. The live view has a real offline state ("<name> is offline", see
    // StreamPlayer), so there's somewhere to go either way; whether a stream is
    // actually running is what the live pill says, not what the switch allows.
    const toggleView = () => setShowLive((v) => !v);

    return (
        // 3-column channel layout: left rail (sidebar width) + center column +
        // right rail (340px). Both rails run the full height (top → bottom); the
        // banner/header/tabs/feed all live in the center column.
        <div className="relative flex min-h-screen w-full">

            {/* ── Left rail — sidebar width ─────────────────────────────────────
                Runs top → bottom alongside the center column. Content TBD. */}
            <aside className="hidden shrink-0 lg:block w-[var(--sidebar-width)]">
                <div className="sticky top-0 flex h-screen flex-col gap-4 p-4" />
            </aside>

            {/* ── Center column ─────────────────────────────────────────────────
                container-type lets the Home rail bleed to this column's edges
                with cqw units (100vw / the full inset would be wrong). */}
            <main className="relative min-w-0 flex-1 [container-type:inline-size]">

            {/* ── Compact header ────────────────────────────────────────────────
                Zero-height sticky anchor at top-0. The inner content overflows
                visually and is invisible until the full header scrolls away.
                No flow height = content below never jumps when it appears.     */}
            <div className={cn("sticky top-0 z-40", buttonMinRef.current ? "" : "h-0 overflow-visible")}>
                {/* bg-panel1 (matching ProfileBanner) spans the full compact-
                    header box (banner + pulled-up content), so the banner colour
                    visually extends PAST its 222px height to under the tabs.
                    (bg-background here left a black seam below the banner.) */}
                <div ref={compactRef} className={cn(
                    "bg-panel1",
                    isMinimized
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none"
                )}>
                    <ProfileBanner user={user} isMinimized={true} />
                    <div className="w-full px-4 pb-2 -mt-34 relative z-30">
                        <div className="flex flex-row items-start gap-6">
                            <ProfileAvatar user={user} isMinimized={true} />
                            <ProfileHeader
                                user={user}
                                isMinimized={true}
                                initialFollowCounts={initialFollowCounts}
                                onNameClick={toggleView}
                                nameTitle="Switch to live view"
                                showLivePill={isLive}
                            />
                        </div>
                        <ProfileTabs
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                            isMinimized={true}
                            action={
                                <button onClick={handleToggle} title="Maximum size" className={resizeBtnClass}>
                                    <MaximizeIcon className="size-6" />
                                </button>
                            }
                        />
                    </div>
                </div>
            </div>

            {/* ── Full header ───────────────────────────────────────────────────
                Normal document flow. Scrolls away naturally. When its bottom
                edge crosses the viewport top, the compact header fades in.     */}
            <div ref={fullRef} className={buttonMinRef.current ? "hidden" : "block"}>
                <ProfileBanner user={user} isMinimized={false} />
                <div className="w-full px-4 py-4 relative z-30">
                    <div className="flex flex-row items-start justify-start gap-6">
                        <ProfileAvatar user={user} isMinimized={false} />
                        <ProfileHeader
                            user={user}
                            isMinimized={false}
                            initialFollowCounts={initialFollowCounts}
                            onNameClick={toggleView}
                            nameTitle="Switch to live view"
                            showLivePill={isLive}
                        />
                    </div>
                    <ProfileTabs
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        isMinimized={false}
                        action={
                            <button onClick={handleToggle} title="Minimum size" className={resizeBtnClass}>
                                <MinimizeIcon className="size-6" />
                            </button>
                        }
                    />
                </div>
            </div>

            {/* ── Content ───────────────────────────────────────────────────── */}
            <div className="w-full px-8 py-4 min-h-screen">
                {/* Keyed by tab so the incoming panel fades in on switch. */}
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                >
                    <ProfileTabContent activeTab={activeTab} user={user} onTabChange={setActiveTab} />
                </motion.div>
            </div>

            </main>

            {/* ── Right rail — 340px ────────────────────────────────────────────
                Runs top → bottom alongside the center column. Content TBD. */}
            <aside className="hidden shrink-0 xl:block w-[340px]">
                <div className="sticky top-0 flex h-screen flex-col gap-4 p-4" />
            </aside>

        </div>
    );
}
