"use client"

import { AnimatePresence, motion } from "motion/react"
import { trpc } from "@/lib/trpc/client"
import React from "react"
import { Tab } from "./types"
import { NotificationHeader } from "./components/notification-header"
import { NotificationSearch } from "./components/notification-search"
import { NotificationTabs } from "./components/notification-tabs"
import { NotificationList } from "./components/notification-list"

interface NotificationsPanelProps {
    open: boolean
    onClose: () => void
}

export function NotificationsPanel({ open, onClose }: NotificationsPanelProps) {
    const [tab, setTab] = React.useState<Tab>("All")
    const [searchQuery, setSearchQuery] = React.useState("")
    const utils = trpc.useUtils()

    const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
        trpc.notification.getNotifications.useInfiniteQuery(
            { limit: 30 },
            { getNextPageParam: (last) => last.nextCursor, enabled: open }
        )

    const { data: unreadData } = trpc.notification.getUnreadCount.useQuery(undefined, { enabled: open })

    const markRead = trpc.notification.markRead.useMutation({
        onSuccess: () => utils.notification.getUnreadCount.invalidate(),
    })
    const markAllRead = trpc.notification.markAllRead.useMutation({
        onSuccess: () => {
            utils.notification.getNotifications.invalidate()
            utils.notification.getUnreadCount.invalidate()
        },
    })

    React.useEffect(() => {
        if (!open) return
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
        document.addEventListener("keydown", handler)
        return () => document.removeEventListener("keydown", handler)
    }, [open, onClose])

    const allNotifs = data?.pages.flatMap(p => p.notifications) ?? []
    const filtered = allNotifs.filter(n => {
        const matchesTab = tab === "Comments" ? n.type === "comment" : true
        const matchesSearch = searchQuery.trim()
            ? (n.body?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                n.actor?.name?.toLowerCase().includes(searchQuery.toLowerCase()))
            : true
        return matchesTab && matchesSearch
    })

    const handleMarkRead = (id: string) => {
        markRead.mutate({ notificationId: id })
    }

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* The backdrop actually dims now. It was invisible, which
                        was fine for a slab welded to the left edge but not for
                        a floating sheet — without it the panel reads as part of
                        the page rather than over it. */}
                    <motion.div
                        key="notifications-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: "tween", duration: 0.15, ease: "easeOut" }}
                        className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-[2px]"
                        onClick={onClose}
                    />

                    {/* Inset, heavily rounded, flat fill with one inner hairline
                        — the house overlay surface, not a full-height slab with
                        a border down its right edge. Springs in from the rail it
                        belongs to rather than fading in place. */}
                    <motion.div
                        key="notifications-panel"
                        initial={{ x: -24, opacity: 0, scale: 0.98 }}
                        animate={{ x: 0, opacity: 1, scale: 1 }}
                        exit={{ x: -24, opacity: 0, scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 420, damping: 36, mass: 0.8 }}
                        className="fixed bottom-3 left-3 top-3 z-[60] flex w-[420px] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[28px] bg-[#0C0C0E] ring-1 ring-white/10"
                    >
                        <NotificationHeader
                            unreadCount={unreadData?.count ?? 0}
                            onMarkAllRead={() => markAllRead.mutate()}
                            onClose={onClose}
                        />

                        <NotificationSearch
                            searchQuery={searchQuery}
                            onSearchChange={setSearchQuery}
                        />

                        <NotificationTabs
                            activeTab={tab}
                            onTabChange={setTab}
                        />

                        <div className="flex-1 overflow-y-auto scrollbar-hide">
                            <NotificationList
                                notifications={filtered}
                                isLoading={isLoading}
                                hasNextPage={hasNextPage ?? false}
                                isFetchingNextPage={isFetchingNextPage}
                                fetchNextPage={fetchNextPage}
                                onMarkRead={handleMarkRead}
                            />
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
