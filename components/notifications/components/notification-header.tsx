"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"

interface NotificationHeaderProps {
    unreadCount: number
    onMarkAllRead: () => void
    onClose: () => void
}

export function NotificationHeader({ unreadCount, onMarkAllRead, onClose }: NotificationHeaderProps) {
    return (
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-3 pt-5">
            <div className="flex min-w-0 items-center gap-2.5">
                <h2 className="text-[22px] font-bold tracking-tight text-white">Notifications</h2>
                {unreadCount > 0 && (
                    <span className="min-w-[24px] rounded-full bg-twitter px-2 py-0.5 text-center text-xs font-bold tabular-nums text-white">
                        {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-1">
                {/* Was in the markup but permanently `hidden`, with a working
                    mutation behind it. Restored as a real action — the panel's
                    accent, so it reads as the affirmative one next to close. */}
                {unreadCount > 0 && (
                    <Button
                        variant="ghost"
                        onClick={onMarkAllRead}
                        aria-label="Mark all notifications read"
                        className="gap-1.5 rounded-full px-3 text-xs font-bold text-twitter hover:bg-twitter/10 hover:text-twitter"
                    >
                        <HugeiconsIcon icon={Tick02Icon} className="size-4" strokeWidth={2.5} />
                        Mark all read
                    </Button>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    aria-label="Close notifications"
                    className="rounded-full bg-white/5 text-zinc-300 ring-1 ring-white/10 hover:bg-white/10 hover:text-white"
                >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-5" strokeWidth={2} />
                </Button>
            </div>
        </div>
    )
}
