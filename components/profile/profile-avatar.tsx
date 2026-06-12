"use client";

import { motion } from "framer-motion";
import { Edit2 } from "lucide-react";
import { UserType } from "@/db/schema/auth/user";
import { OnlineIndicator } from "@/components/ui/online-indicator";
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
                    "rounded-full border-black ring-1 ring-white/10 bg-zinc-900 overflow-hidden shadow-2xl group cursor-pointer relative",
                    isMinimized ? "size-24 border-[6px]" : "size-40 border-[6px]"
                )}
            >
                {user.avatar_url || user.image ? (
                    <img
                        src={user.avatar_url || user.image || ""}
                        alt={user.username || "Avatar"}
                        className="object-cover size-full"
                    />
                ) : (
                    <div className="size-full flex items-center justify-center text-zinc-700 bg-zinc-900">
                        <span className="text-5xl font-bold uppercase select-none">
                            {user.username?.[0] || user.name?.[0]}
                        </span>
                    </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center">
                    <Edit2 className="text-white" size={32} />
                </div>
            </div>
        </div>
    );
}
