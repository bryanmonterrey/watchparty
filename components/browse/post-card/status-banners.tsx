"use client";

import React from "react";
import { RetweetIcon } from "@/components/icons";
import { Pin } from "lucide-react";
import type { PostCardPost } from "./post-card.types";

interface StatusBannersProps {
    post: PostCardPost;
}

export function StatusBanners({ post }: StatusBannersProps) {
    const { repostedBy, isPinned } = post;

    return (
        <>
            {repostedBy && (
                <div className="flex items-center gap-1.5 mb-1 ml-[24px] text-postgray">
                    <RetweetIcon className="w-[15px] h-[15px] shrink-0" />
                    <span className="text-[13px] font-bold leading-none">{repostedBy.name} reposted</span>
                </div>
            )}
            {isPinned && !repostedBy && (
                <div className="flex items-center gap-1.5 mb-1 ml-[36px] text-postgray">
                    <Pin className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-[13px] font-bold leading-none">Pinned post</span>
                </div>
            )}
        </>
    );
}
