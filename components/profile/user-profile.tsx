"use client";

import { useState, useEffect, useRef } from "react";
import { UserType } from "@/db/schema/auth/user";
import { ProfileBanner } from "./profile-banner";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileHeader } from "./profile-header";
import { ProfileTabs, TABS } from "./profile-tabs";
import { ProfileTabContent } from "./profile-tab-content";
import { ProfilePnlCard } from "./profile-pnl-card";
import { cn } from "@/lib/utils";

interface UserProfileProps {
    user: UserType;
}

export function UserProfile({ user }: UserProfileProps) {
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
        <div className="min-h-screen">

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
                        "",
                        "max-w-[1400px] w-full mx-auto px-8 -mt-34 relative z-30"
                    )}>
                        <div className="flex flex-row items-end gap-6">
                            <ProfileAvatar user={user} isMinimized={true} />
                            <ProfileHeader
                                user={user}
                                isMinimized={true}
                                onToggleSize={handleToggle}
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
                    "",
                    "max-w-[1400px] w-full mx-auto px-8 -mt-34 relative z-30"
                )}>
                    <div className="flex flex-col justify-start items-start space-y-1.5">
                        <ProfileAvatar user={user} isMinimized={false} />
                        <ProfileHeader
                            user={user}
                            isMinimized={false}
                            onToggleSize={handleToggle}
                        />
                        <ProfilePnlCard userId={user.id} name={user.name} />
                    </div>
                    <ProfileTabs
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        isMinimized={false}
                    />
                </div>
            </div>

            {/* ── Content ───────────────────────────────────────────────────── */}
            <div className="max-w-[1400px] w-full mx-auto px-8 py-4 min-h-screen">
                <ProfileTabContent activeTab={activeTab} user={user} />
            </div>

        </div>
    );
}
