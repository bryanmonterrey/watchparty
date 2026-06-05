"use client"

import { Bell } from "lucide-react"
import { NotificationItem } from "./notification-item"

interface NotificationListProps {
    notifications: any[]
    isLoading: boolean
    hasNextPage: boolean
    isFetchingNextPage: boolean
    fetchNextPage: () => void
    onMarkRead: (id: string) => void
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

            {hasNextPage && (
                <div className="pb-8">
                    {isFetchingNextPage ? (
                        <div className="flex flex-col gap-1 px-5">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 py-3 opacity-60">
                                    <div className="w-10 h-10 rounded-full shrink-0 shimmer-skeleton" />
                                    <div className="flex-1 flex flex-col gap-2">
                                        <div className="h-3.5 w-48 rounded-full shimmer-skeleton" />
                                        <div className="h-2.5 w-24 rounded-full shimmer-skeleton" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-4 flex justify-center">
                            <button
                                onClick={() => fetchNextPage()}
                                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                            >
                                Load more
                            </button>
                        </div>
                    )}
                </div>
            )}
        </>
    )
}
