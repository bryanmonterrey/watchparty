"use client"

import { AnimatePresence, motion } from "motion/react"
import { trpc } from "@/lib/trpc/client"
import React from "react"
import { useAuthSession } from "@/hooks/use-auth-session"
import { notificationsSnapshotStore } from "@/lib/snapshot/surfaces"
import { privateViewerKey } from "@/lib/snapshot/keys"
import { useSnapshot, useSnapshotPlaceholder } from "@/hooks/use-snapshot"
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
    // The list scrolls inside the panel, not the page — LoadMore roots its
    // observer here so the sentinel isn't clipped out of view forever.
    const scrollRef = React.useRef<HTMLDivElement>(null)

    // Private surface: no viewer, no key, and every store treats "" as inert —
    // so a signed-out render can neither read nor write someone's notifications.
    const { data: notifSession } = useAuthSession()
    const notifSnapshotKey = privateViewerKey(notifSession?.user?.id, "notifications")
    const snapshotPlaceholder = useSnapshotPlaceholder(notificationsSnapshotStore.read, notifSnapshotKey)

    const { data, isLoading, fetchNextPage, hasNextPage, isPlaceholderData } =
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
                placeholderData: snapshotPlaceholder,
            }
        )

    useSnapshot(notificationsSnapshotStore, notifSnapshotKey, data, isPlaceholderData)

    const { data: unreadData } = trpc.notification.getUnreadCount.useQuery(undefined, { enabled: open })

    const markRead = trpc.notification.markRead.useMutation({
        onSuccess: () => utils.notification.getUnreadCount.invalidate(),
    })
    const markAllRead = trpc.notification.markAllRead.useMutation({
        // Optimistic: every badge on the page (sidebar bell, tab title, this
        // header) reads the same query key, so zeroing it here clears them
        // all in the same frame the panel opens.
        onMutate: async () => {
            await utils.notification.getUnreadCount.cancel()
            utils.notification.getUnreadCount.setData(undefined, { count: 0 })
        },
        onSettled: () => utils.notification.getUnreadCount.invalidate(),
    })

    // OPENING THE PANEL READS EVERYTHING — the badge is "you have things to
    // look at", and looking at them is what opening is. Until 2026-08-28 the
    // only path was the header's explicit button, so the count sat there
    // after the panel had been opened and closed (owner report).
    //
    // Once per open, and only after the count has landed (>0): that is both
    // the "nothing to do" guard and the ordering that keeps the unread tint
    // on the rows for THIS viewing — the list is not invalidated here, only
    // when the panel closes, so the rows you just opened for still read as
    // new while you look at them and are plain the next time.
    const viewerId = notifSession?.user?.id
    const unreadCount = unreadData?.count ?? 0
    const clearedThisOpen = React.useRef(false)
    const markAllReadMutate = markAllRead.mutate
    React.useEffect(() => {
        if (!open) {
            if (clearedThisOpen.current) utils.notification.getNotifications.invalidate()
            clearedThisOpen.current = false
            return
        }
        if (clearedThisOpen.current || !viewerId || unreadCount === 0) return
        clearedThisOpen.current = true
        markAllReadMutate()
    }, [open, viewerId, unreadCount, markAllReadMutate, utils])

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
                            onMarkAllRead={() =>
                                markAllRead.mutate(undefined, {
                                    onSuccess: () => utils.notification.getNotifications.invalidate(),
                                })
                            }
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

                        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide">
                            <NotificationList
                                notifications={filtered}
                                isLoading={isLoading}
                                hasNextPage={hasNextPage ?? false}
                                fetchNextPage={fetchNextPage}
                                onMarkRead={handleMarkRead}
                                scrollRef={scrollRef}
                            />
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
