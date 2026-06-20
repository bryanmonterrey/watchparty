"use client";

import React from "react";
import { OnlineIndicator } from "@/components/ui/online-indicator";
import type { PostCardUser } from "./post-card.types";

interface PostCardAvatarProps {
    user: PostCardUser;
    userId?: string | null;
    connectTop?: boolean;
    connectBottom?: boolean;
}

export function PostCardAvatar({ user, userId, connectTop, connectBottom }: PostCardAvatarProps) {
    return (
        <div className="flex flex-col items-center shrink-0 w-11 pt-1 relative h-full">
            {/* Thread line top */}
            {connectTop && (
                <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 bg-zinc-700/50 z-20"
                    style={{ height: '4px' }}
                />
            )}

            <div className="w-11 h-11 rounded-full overflow-hidden bg-zinc-800 relative shrink-0 z-30">
                {user.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={user.avatar_url}
                        alt={user.name || "User"}
                        className="w-full h-full object-cover rounded-full"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-700 text-zinc-400 font-bold rounded-full">
                        {(user.name?.[0] || "U")}
                    </div>
                )}
            </div>

        </div>
    );
}
