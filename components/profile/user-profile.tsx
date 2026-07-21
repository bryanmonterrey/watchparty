"use client";

import { useState, useEffect, useRef } from "react";
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
        <div className="relative min-h-screen">

            {/* Channel accent: Twitch-style vertical brand bar on the right
                edge, in the user's chosen color (edit-profile). Sits ABOVE the
                banner (z-20 vs z-15): masked out where the image is solid,
                fully solid across the banner's bottom fade strip (the
                from-background gradient band) — under the image, over the
                fade. Stops shift with the compact banner (200px) when
                button-minimized; the pinned sticky header (z-40) covers it. */}
            {user.accentColor && (
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-0 z-20 w-12"
                    style={{
                        background: user.accentColor,
                        maskImage: buttonMinRef.current
                            ? "linear-gradient(to bottom, transparent 120px, black 152px)"
                            : "linear-gradient(to bottom, transparent 200px, black 248px)",
                        WebkitMaskImage: buttonMinRef.current
                            ? "linear-gradient(to bottom, transparent 120px, black 152px)"
                            : "linear-gradient(to bottom, transparent 200px, black 248px)",
                    }}
                />
            )}

            {/* ── Compact header ────────────────────────────────────────────────
                Zero-height sticky anchor at top-0. The inner content overflows
                visually and is invisible until the full header scrolls away.
                No flow height = content below never jumps when it appears.     */}
            <div className={cn("sticky top-0 z-40", buttonMinRef.current ? "" : "h-0 overflow-visible")}>
                <div ref={compactRef} className={cn(
                    "",
                    isMinimized
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none"
                )}>
                    <ProfileBanner user={user} isMinimized={true} />
                    <div className={cn(
                        "max-w-[1400px] w-full mx-auto px-8 -mt-34 relative z-30",
                        user.accentColor && "pr-20",
                    )}>
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
                <div className={cn(
                    "max-w-[1400px] w-full mx-auto px-8 -mt-34 relative z-30",
                    user.accentColor && "pr-20",
                )}>
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
            <div className={cn(
                "max-w-[1400px] w-full mx-auto px-8 py-4 min-h-screen",
                user.accentColor && "pr-20",
            )}>
                <ProfileTabContent activeTab={activeTab} user={user} onTabChange={setActiveTab} />
            </div>

        </div>
    );
}
