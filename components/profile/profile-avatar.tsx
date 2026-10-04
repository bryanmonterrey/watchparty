"use client";

import { motion } from "framer-motion";
import * as React from "react";
import { UserType } from "@/db/schema/auth/user";
import { ImageViewer } from "@/components/ui/image-viewer";
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

    // A real avatar opens full-size in the post viewer (owner, 2026-10-04:
    // "clicking on someone's avatar should bring up a dialog with their
    // image"). The placeholder is not a picture of anyone, so it stays inert.
    const avatarUrl = user.avatar_url || user.image || null;
    const [open, setOpen] = React.useState(false);

    const frame = cn(
        "rounded-full border-soft-gray/5 overflow-hidden shadow-2xl relative",
        isMinimized ? "size-24 border-[6px]" : "size-24 border-[6px]",
    );
    const img = (
        <img
            src={avatarUrl || "/avatar.png"}
            alt={user.username || ""}
            className="object-cover size-full"
        />
    );

    return (
        <div className="relative z-30 ">
            {avatarUrl ? (
                <>
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        aria-label={`view ${user.username || "profile"} picture`}
                        className={cn(frame, "block cursor-pointer p-0")}
                    >
                        {img}
                    </button>
                    <ImageViewer imageUrl={avatarUrl} isOpen={open} onClose={() => setOpen(false)} />
                </>
            ) : (
                <div className={frame}>{img}</div>
            )}
        </div>
    );
}
