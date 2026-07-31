"use client";

import { UserType } from "@/db/schema/auth/user";

import { cn } from "@/lib/utils";

interface ProfileBannerProps {
    user: UserType;
    isMinimized?: boolean;
}

export function ProfileBanner({ isMinimized }: ProfileBannerProps) {
    return (
        <div className={cn(
            "relative w-full z-15 bg-soft-gray-5 group overflow-hidden rounded-none",
            isMinimized ? "h-[222px]" : "h-[147px]"
        )}>
            {/* Banner image hidden for now — plain panel1 fill. Restore the
                banner_url / avatar image block from git history to re-enable. */}
        </div>
    );
}
