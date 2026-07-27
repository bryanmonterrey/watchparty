"use client"

import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { formatRelativeTime } from "@/lib/date-utils"
import { TYPE_CONFIG } from "../types"

interface NotificationItemProps {
    notification: any
    onMarkRead: (id: string) => void
}

export function NotificationItem({ notification: n, onMarkRead }: NotificationItemProps) {
    const cfg = TYPE_CONFIG[n.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.system
    const unread = !n.isRead

    return (
        // A card row rather than a full-bleed band: inset, rounded, and lifted
        // off the panel by its own fill. Unread is a blue tint plus a blue rail
        // down the left edge — the state reads before you've parsed a word of
        // it, which a single trailing dot never managed.
        <div
            onClick={() => unread && onMarkRead(n.id)}
            className={cn(
                "group relative flex cursor-default items-center gap-3 overflow-hidden rounded-2xl px-3 py-3 transition-colors",
                unread ? "bg-twitter/[0.07] hover:bg-twitter/[0.11]" : "hover:bg-white/[0.04]",
            )}
        >
            {unread && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-twitter" />}

            {/* Actor avatar with the type badge riding its corner. */}
            <div className="relative shrink-0">
                <Avatar className="size-10">
                    <AvatarImage src={n.actor?.avatar_url ?? undefined} />
                    <AvatarFallback />
                </Avatar>
                <div
                    className={cn(
                        "absolute -bottom-0.5 -right-0.5 flex size-[22px] items-center justify-center rounded-full ring-2 ring-black",
                        cfg.bg,
                    )}
                >
                    <HugeiconsIcon icon={cfg.icon} className={cn("size-3", cfg.color)} strokeWidth={2.5} />
                </div>
            </div>

            <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-zinc-300">
                    {n.actor && <span className="font-bold text-white">{n.actor.name} </span>}
                    {n.body ?? cfg.label}
                </p>
                <p className="mt-0.5 text-[13px] text-zinc-500">
                    {formatRelativeTime(new Date(n.createdAt).toISOString())}
                </p>
            </div>

            {/* One-tap copy: trade/callout alerts carry the token slug in
                postId — jump straight to the token page's swap card. */}
            {(n.type === "trade" || n.type === "callout") && n.postId && (
                <Link
                    href={`/${n.postId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 rounded-full bg-lantern/10 px-3.5 py-2 text-xs font-bold text-lantern transition-colors hover:bg-lantern/20"
                >
                    {n.type === "trade" ? "Copy" : "View"}
                </Link>
            )}
        </div>
    )
}
