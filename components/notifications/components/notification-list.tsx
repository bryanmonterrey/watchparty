"use client"

import { Bell } from "lucide-react"
import { NotificationItem } from "./notification-item"
import { LoadMore } from "@/components/interior/load-more"

interface NotificationListProps {
    notifications: any[]
    isLoading: boolean
    hasNextPage: boolean
    // Returns the fetch promise (tRPC's fetchNextPage) — LoadMore awaits it to
    // know when the page landed, so this must not be narrowed to `void`.
    fetchNextPage: () => unknown
    onMarkRead: (id: string) => void
}

export function NotificationList({
    notifications,
    isLoading,
    hasNextPage,
    fetchNextPage,
    onMarkRead,
}: NotificationListProps) {
    if (isLoading) {
        return (
            <div className="flex flex-col gap-1 px-5">
                {Array.from({ length: 12 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 py-3 opacity-80">
                        <div className="w-10 h-10 rounded-full shrink-0 shimmer-skeleton" />
                        <div className="flex-1 flex flex-col gap-2">
                            <div className="h-3.5 w-48 rounded-full shimmer-skeleton" />
                            <div className="h-2.5 w-24 rounded-full shimmer-skeleton" />
                        </div>
                    </div>
                ))}
            </div>
        )
    }

    if (notifications.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center px-8">
                <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center">
                    <Bell className="w-6 h-6 text-zinc-500" />
                </div>
                <p className="text-zinc-400 font-semibold">No notifications yet</p>
                <p className="text-zinc-500 text-sm">When someone interacts with you, you'll see it here.</p>
            </div>
        )
    }

    return (
        <>
            {notifications.map((n) => (
                <NotificationItem 
                    key={n.id} 
                    notification={n} 
                    onMarkRead={onMarkRead} 
                />
            ))}

            <LoadMore
                onLoad={() => fetchNextPage()}
                hasMore={hasNextPage}
                className="py-4 pb-8"
                labels={{ end: "You’re all caught up" }}
            />
        </>
    )
}
