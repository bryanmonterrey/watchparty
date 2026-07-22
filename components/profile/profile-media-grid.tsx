"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";

// Media tab: Instagram-style grid of the user's image posts — square tiles,
// tight gaps, a stack glyph on multi-image posts. Each tile opens the post.

export function ProfileMediaGrid({ userId, isOwner }: { userId: string; isOwner: boolean }) {
    const { data, isLoading } = trpc.content.getMediaByUser.useQuery({ userId, limit: 60 });

    if (isLoading) {
        return (
            <div className="grid max-w-4xl grid-cols-3 gap-1 sm:gap-1.5">
                {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="shimmer-skeleton aspect-square rounded-[12px]" />
                ))}
            </div>
        );
    }

    const items = data?.items ?? [];
    if (!items.length) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center">
                <h3 className="mb-3 text-3xl font-black tracking-tighter text-white">No media yet</h3>
                <p className="max-w-md text-[16px] leading-relaxed text-zinc-500">
                    {isOwner ? "Photos you post will show up here." : "This user hasn't posted any photos yet."}
                </p>
            </div>
        );
    }

    return (
        <div className="grid max-w-4xl grid-cols-3 gap-1 sm:gap-1.5">
            {items.map((item) => (
                <Link
                    key={item.id}
                    href={`/discover/post/${item.id}`}
                    className="group relative aspect-square overflow-hidden rounded-[12px] bg-zinc-900"
                >
                    <img
                        src={item.images[0]}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                    />
                    {item.images.length > 1 && (
                        <span className="absolute right-2 top-2 rounded-full bg-black/40 p-1.5 text-white backdrop-blur-md">
                            <HugeiconsIcon icon={Copy01Icon} className="size-4" strokeWidth={2.5} />
                        </span>
                    )}
                    <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                </Link>
            ))}
        </div>
    );
}
