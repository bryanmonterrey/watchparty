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
                    <motion.div
                        key="notifications-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: "tween", duration: 0.1, ease: "easeOut" }}
                        className="fixed inset-0 z-[55]"
                        onClick={onClose}
                    />

                    <motion.div
                        key="notifications-panel"
                        initial={{ x: -16, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -16, opacity: 0 }}
                        transition={{ type: "tween", duration: 0.1, ease: "easeOut" }}
                        className="fixed left-0 top-0 h-screen w-[440px] z-[60] flex flex-col bg-black border-r border-flexborder/50 overflow-hidden"
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
