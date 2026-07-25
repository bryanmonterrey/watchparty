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
import { MaximizeIcon, MinimizeIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

// Resize toggle skin — sits right-aligned on the tabs row in both the full and
// compact headers. No fill at rest, just a hover background.
const resizeBtnClass = "flex size-9 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-soft-gray-15 hover:text-zinc-100";

interface UserProfileProps {
    user: UserType;
    /** Server-fetched so the counts row renders with the rest of the header. */
    initialFollowCounts?: { followers: number; following: number };
}

export function UserProfile({ user, initialFollowCounts }: UserProfileProps) {
    const [activeTab, setActiveTab] = useState(TABS[0]);
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
                {/* bg-background spans the full compact-header box (banner +
                    pulled-up content), so it reaches PAST the 200px banner to
                    the tabs' underline (~y208). Without it the underline's ~8px
                    overhang floats over the scrolling page instead of sitting
                    at bottom-0 of a background. */}
                <div ref={compactRef} className={cn(
                    "bg-background",
                    isMinimized
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none"
                )}>
                    <ProfileBanner user={user} isMinimized={true} />
                    <div className="w-full px-4 -mt-34 relative z-30">
                        <div className="flex flex-row items-start gap-6">
                            <ProfileAvatar user={user} isMinimized={true} />
                            <ProfileHeader
                                user={user}
                                isMinimized={true}
                                initialFollowCounts={initialFollowCounts}
                            />
                        </div>
                        <ProfileTabs
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                            isMinimized={true}
                            action={
                                <button onClick={handleToggle} title="Maximum size" className={resizeBtnClass}>
                                    <MaximizeIcon className="size-5" />
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
                        />
                    </div>
                    <ProfileTabs
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        isMinimized={false}
                        action={
                            <button onClick={handleToggle} title="Minimum size" className={resizeBtnClass}>
                                <MinimizeIcon className="size-5" />
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
