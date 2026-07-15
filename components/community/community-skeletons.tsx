"use client";

import { cn } from "@/lib/utils";

/** Shimmer bone — the house skeleton (shimmer fill inside a sized container). */
function Bone({ className }: { className?: string }) {
    return (
        <div className={cn("overflow-hidden rounded-md", className)}>
            <div className="size-full shimmer-skeleton" />
        </div>
    );
}

/* ─── Channel chat ─────────────────────────────────────────── */
export function ChannelChatSkeleton() {
    return (
        <div className="flex flex-col h-full min-w-0">
            {/* header */}
            <div className="h-17 shrink-0 px-4 flex items-center gap-x-2">
                <Bone className="h-6 w-6 rounded-lg" />
                <Bone className="h-4 w-32" />
                <Bone className="ml-auto h-4 w-4 rounded-full" />
            </div>

            {/* messages */}
            <div className="flex-1 flex flex-col justify-end gap-5 p-4 overflow-hidden">
                {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex gap-x-3">
                        <Bone className="h-9 w-9 rounded-full shrink-0" />
                        <div className="flex flex-col gap-2 w-full">
                            <div className="flex items-center gap-2">
                                <Bone className="h-3.5 w-24" />
                                <Bone className="h-3 w-14 opacity-60" />
                            </div>
                            <Bone className={cn("h-3.5", i % 3 === 0 ? "w-2/3" : i % 3 === 1 ? "w-1/2" : "w-3/4")} />
                            {i % 4 === 0 && <Bone className="h-3.5 w-1/3" />}
                        </div>
                    </div>
                ))}
            </div>

            {/* input */}
            <div className="px-4 pb-5 pt-1">
                <Bone className="h-12 w-full rounded-2xl" />
            </div>
        </div>
    );
}

/* ─── Server sidebar (channel list) ────────────────────────── */
export function ServerSidebarSkeleton() {
    return (
        <div className="flex flex-col h-full w-76 bg-zinc-900/60 md:pt-[var(--header-height)] shrink-0">
            <div className="h-12 flex items-center px-4">
                <Bone className="h-4 w-32" />
            </div>
            <div className="flex-1 px-3 pt-5 space-y-5">
                {Array.from({ length: 3 }).map((_, section) => (
                    <div key={section} className="space-y-2">
                        <Bone className="h-3 w-20 ml-2 opacity-70" />
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                                <Bone className="h-4 w-4 rounded" />
                                <Bone className={cn("h-3.5", i % 2 ? "w-24" : "w-32")} />
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ─── Explore grid ─────────────────────────────────────────── */
export function ExploreSkeleton() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
                <div
                    key={i}
                    className="rounded-3xl overflow-hidden bg-white/[0.03]"
                >
                    <Bone className="h-24 w-full rounded-none" />
                    <div className="p-4 -mt-8">
                        <Bone className="h-14 w-14 rounded-2xl" />
                        <Bone className="h-4 w-32 mt-3" />
                        <Bone className="h-3 w-full mt-3" />
                        <Bone className="h-3 w-2/3 mt-2" />
                        <Bone className="h-9 w-full mt-4 rounded-full" />
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ─── Spaces list ──────────────────────────────────────────── */
export function SpacesSkeleton() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-3xl bg-white/[0.03] p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Bone className="h-5 w-16 rounded-full" />
                        <Bone className="h-4 w-24 ml-auto" />
                    </div>
                    <Bone className="h-5 w-3/4" />
                    <Bone className="h-3 w-1/2 mt-2" />
                    <div className="flex -space-x-2 mt-5">
                        {Array.from({ length: 4 }).map((_, j) => (
                            <Bone key={j} className="h-9 w-9 rounded-full" />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ─── Friends list ─────────────────────────────────────────── */
export function FriendsSkeleton() {
    return (
        <div className="space-y-1">
            {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
                    <Bone className="h-10 w-10 rounded-full shrink-0" />
                    <div className="flex flex-col gap-2">
                        <Bone className="h-3.5 w-32" />
                        <Bone className="h-3 w-20 opacity-60" />
                    </div>
                    <Bone className="ml-auto h-8 w-8 rounded-full" />
                </div>
            ))}
        </div>
    );
}
