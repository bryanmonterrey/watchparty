"use client";

import { motion } from "framer-motion";
import { UserType } from "@/db/schema/auth/user";
import { LiveBadge } from "@/components/streaming/live-badge";
import { trpc } from "@/lib/trpc/client";

import { cn } from "@/lib/utils";

interface ProfileAvatarProps {
    user: UserType;
    isMinimized?: boolean;
}

export function ProfileAvatar({ user, isMinimized }: ProfileAvatarProps) {
    const { data: stream } = trpc.stream.getByUserId.useQuery(
        { userId: user.id },
        // staleTime matches the interval on purpose. Without it every
        // remount refetches immediately regardless of how fresh the data
        // is — the same shape as the get-session burst, where 94 mounts
        // of one hook produced 24.8% 429s. This renders twice on a
        // profile page already.
        { refetchInterval: 30_000, staleTime: 30_000 },
    );
    const isLive = stream?.isLive ?? false;

    return (
        <div className="relative z-30 ">
            <div
                className={cn(
                    "rounded-full border-soft-gray/5 overflow-hidden shadow-2xl relative",
                    isMinimized ? "size-24 border-[6px]" : "size-24 border-[6px]"
                )}
            >
                <img
                    src={user.avatar_url || user.image || "/avatar.png"}
                    alt={user.username || ""}
                    className="object-cover size-full"
                />
            </div>
        </div>
    );
}
