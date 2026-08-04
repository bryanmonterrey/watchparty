"use client";

import React from "react";
import { OnlineIndicator } from "@/components/ui/online-indicator";
import type { PostCardUser } from "./post-card.types";

interface PostCardAvatarProps {
    user: PostCardUser;
    userId?: string | null;
    connectTop?: boolean;
    connectBottom?: boolean;
    /** Go to the profile. Lives on the IMAGE, never on the column around it. */
    onClick?: (e: React.MouseEvent) => void;
}

// size-10, matching the composer's avatar. The column is the same width so the
// thread line still runs through its centre.
export function PostCardAvatar({ user, onClick }: PostCardAvatarProps) {
    return (
        <div className="flex flex-col items-center shrink-0 w-10 pt-1 relative h-full">
            {/* The click target is exactly the avatar. It used to sit on the
                self-stretch column wrapping this, which spans the card's FULL
                height — so clicking any empty space below the avatar, all the
                way to the bottom of the post, opened the profile instead of the
                post. The profile is still reachable from the image, the name,
                the username and the hover card. */}
            <div
                onClick={onClick}
                className="w-10 h-10 rounded-full overflow-hidden bg-zinc-800 relative shrink-0 z-30 cursor-pointer"
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={user.avatar_url || "/avatar.png"}
                    alt={user.name || ""}
                    className="w-full h-full object-cover rounded-full"
                />
            </div>

        </div>
    );
}
