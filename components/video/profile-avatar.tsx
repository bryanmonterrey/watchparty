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
    const { data: stream } = trpc.stream.getByUserId.useQuery({ userId: user.id }, { refetchInterval: 30_000 });
    const isLive = stream?.isLive ?? false;

    return (
        <div className="relative z-30 ">
            <div
                className={cn(
                    "rounded-full border-black ring-1 ring-white/10 bg-zinc-900 overflow-hidden shadow-2xl relative",
                    isMinimized ? "size-20 border-[6px]" : "size-16 border-[6px]"
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
