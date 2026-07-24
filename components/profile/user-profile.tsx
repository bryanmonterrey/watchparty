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
import { cn } from "@/lib/utils";

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
        // container-type lets the Home rail bleed to the true content-area
        // edges with cqw units (the app has a sidebar, so 100vw is wrong).
        <div className="relative min-h-screen [container-type:inline-size]">

            {/* Channel accent: Twitch-style vertical brand bar on the right
                edge, in the user's chosen color (edit-profile). Runs from the
                banner's bottom edge down to the bottom of the page — a hard top
                edge at the banner bottom so it never shows ON the banner. The
                top offsets MUST match ProfileBanner's heights (full 320 /
                compact 200). z-20 sits under the headers (z-30) and the pinned
                compact header (z-40); content clears it via pr-20. */}
            {user.accentColor && (
                <div
                    aria-hidden
                    className="pointer-events-none absolute right-0 bottom-0 z-20 w-12"
                    style={{
                        top: buttonMinRef.current ? 200 : 320,
                        background: user.accentColor,
                    }}
                />
            )}

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
                    <div className={cn("max-w-[1400px] w-full mx-auto px-8 -mt-34 relative z-30", user.accentColor && "pr-20")}>
                        <div className="flex flex-row items-end gap-6">
                            <ProfileAvatar user={user} isMinimized={true} />
                            <ProfileHeader
                                user={user}
                                isMinimized={true}
                                onToggleSize={handleToggle}
                                initialFollowCounts={initialFollowCounts}
                            />
                        </div>
                        <ProfileTabs
                            activeTab={activeTab}
                            onTabChange={setActiveTab}
                            isMinimized={true}
                        />
                    </div>
                </div>
            </div>

            {/* ── Full header ───────────────────────────────────────────────────
                Normal document flow. Scrolls away naturally. When its bottom
                edge crosses the viewport top, the compact header fades in.     */}
            <div ref={fullRef} className={buttonMinRef.current ? "hidden" : "block"}>
                <ProfileBanner user={user} isMinimized={false} />
                <div className={cn("max-w-[1400px] w-full mx-auto px-8 -mt-20 relative z-30", user.accentColor && "pr-20")}>
                    <div className="flex flex-col justify-start items-start space-y-1.5">
                        <ProfileAvatar user={user} isMinimized={false} />
                        <ProfileHeader
                            user={user}
                            isMinimized={false}
                            onToggleSize={handleToggle}
                            initialFollowCounts={initialFollowCounts}
                        />
                    </div>
                    <ProfileTabs
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        isMinimized={false}
                    />
                </div>
            </div>

            {/* ── Content ───────────────────────────────────────────────────── */}
            <div className={cn("max-w-[1400px] w-full mx-auto px-8 py-4 min-h-screen", user.accentColor && "pr-20")}>
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

        </div>
    );
}
