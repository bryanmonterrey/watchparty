"use client"

import { AnimatePresence, motion } from "motion/react"
import { trpc } from "@/lib/trpc/client"
import React from "react"
import { useAuthSession } from "@/hooks/use-auth-session"
import { notificationsSnapshotStore } from "@/lib/snapshot/surfaces"
import { privateViewerKey } from "@/lib/snapshot/keys"
import { useSnapshot } from "@/hooks/use-snapshot"
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

    // Private surface: no viewer, no key, and every store treats "" as inert —
    // so a signed-out render can neither read nor write someone's notifications.
    const { data: notifSession } = useAuthSession()
    const notifSnapshotKey = privateViewerKey(notifSession?.user?.id, "notifications")

    const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, isPlaceholderData } =
        trpc.notification.getNotifications.useInfiniteQuery(
            { limit: 30 },
            {
                getNextPageParam: (last) => last.nextCursor,
                // `open` AND a resolved viewer: placeholderData is only read
                // while the query is pending, and privateViewerKey has no key
                // until the session lands — see bookmarks-feed for the full
                // reasoning. Without the viewer gate the snapshot loses a race
                // with its own fetch and the bell shows a spinner anyway.
                enabled: open && !!notifSession?.user?.id,
                // Placeholder data paints even while the query is disabled, so
                // the list is on screen the instant the bell opens instead of
                // after a round trip. The unread BADGE is not painted from here
                // — that's `getUnreadCount`, a separate live query.
                placeholderData: () => notificationsSnapshotStore.read(notifSnapshotKey),
            }
        )

    useSnapshot(notificationsSnapshotStore, notifSnapshotKey, data, isPlaceholderData)

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
                        // w-[506px]: 440 + 15%.
                        className="fixed left-0 top-0 h-screen w-[506px] z-[60] flex flex-col bg-black border-r border-flexborder/50 overflow-hidden"
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
