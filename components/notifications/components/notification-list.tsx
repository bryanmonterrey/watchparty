"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Notification01Icon } from "@hugeicons/core-free-icons"
import { staggerPulse } from "@/lib/skeleton-stagger"
import { NotificationItem } from "./notification-item"

interface NotificationListProps {
    notifications: any[]
    isLoading: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    fetchNextPage: () => void
    onMarkRead: (id: string) => void
}

/** The list's own loading row — same geometry as a real one, so nothing jumps
 *  when the data lands. Staggered per the app's one skeleton standard. */
function RowSkeleton({ index, count }: { index: number; count: number }) {
    const pulse = staggerPulse(index, count)
    return (
        <div className="flex items-center gap-3 rounded-2xl px-3 py-3">
            <span style={pulse} className="size-10 shrink-0 rounded-full shimmer-skeleton" />
            <span className="flex flex-1 flex-col gap-2">
                <span style={pulse} className="h-3.5 w-48 rounded-full shimmer-skeleton" />
                <span style={pulse} className="h-2.5 w-24 rounded-full shimmer-skeleton" />
            </span>
        </div>
    )
}

export function NotificationList({
    notifications,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    onMarkRead,
}: NotificationListProps) {
    if (isLoading) {
        return (
            <div className="flex flex-col gap-1 px-3">
                {Array.from({ length: 12 }).map((_, i) => (
                    <RowSkeleton key={i} index={i} count={12} />
                ))}
            </div>
        )
    }

    if (notifications.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 px-8 py-20 text-center">
                <div className="flex size-16 items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-white/10">
                    <HugeiconsIcon icon={Notification01Icon} className="size-7 text-zinc-500" strokeWidth={1.8} />
                </div>
                <p className="font-bold text-zinc-300">No notifications yet</p>
                <p className="text-sm text-zinc-500">When someone interacts with you, you&apos;ll see it here.</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-1 px-3 pb-3">
            {notifications.map((n) => (
                <NotificationItem key={n.id} notification={n} onMarkRead={onMarkRead} />
            ))}

            {hasNextPage &&
                (isFetchingNextPage ? (
                    Array.from({ length: 3 }).map((_, i) => <RowSkeleton key={`s${i}`} index={i} count={3} />)
                ) : (
                    <div className="flex justify-center py-3">
                        <button
                            onClick={() => fetchNextPage()}
                            className="h-9 cursor-pointer rounded-full px-4 text-xs font-bold text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
                        >
                            Load more
                        </button>
                    </div>
                ))}
        </div>
    )
}
