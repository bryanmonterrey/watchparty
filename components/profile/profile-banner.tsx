"use client";

import { UserType } from "@/db/schema/auth/user";

import { cn } from "@/lib/utils";

interface ProfileBannerProps {
    user: UserType;
    isMinimized?: boolean;
}

export function ProfileBanner({ user, isMinimized }: ProfileBannerProps) {
    return (
        <div className={cn(
            "relative w-full z-15 bg-black group overflow-hidden",
            isMinimized ? "h-[200px]" : "h-[320px]"
        )}>
            <div className="absolute inset-0 bg-gradient-to-t from-black2 via-transparent to-black2/20 z-10" />
            <div className="size-full">
                {user.banner_url ? (
                    <img
                        src={user.banner_url}
                        alt="Profile Banner"
                        className="object-cover size-full blur-2xl opacity-60"
                    />
                ) : (user.avatar_url || user.image) ? (
                    <img
                        src={user.avatar_url || user.image || ""}
                        alt="Default Profile Banner"
                        className="object-cover size-full scale-110 blur-2xl opacity-60"
                    />
                ) : (
                    <div className="size-full bg-gradient-to-br from-zinc-800 to-zinc-900" />
                )}
            </div>
        </div>
    );
}
