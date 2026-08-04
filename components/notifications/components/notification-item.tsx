"use client"

import Link from "next/link"
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
    const Icon = cfg.icon

    return (
        <div
            onClick={() => !n.isRead && onMarkRead(n.id)}
            className={cn(
                "flex items-center gap-3 px-5 py-3 hover:bg-zinc-900/60 transition-colors cursor-default",
                !n.isRead && "bg-zinc-900/30"
            )}
        >
            {/* Actor avatar with type icon overlay */}
            <div className="relative shrink-0">
                <Avatar className="size-10 border border-zinc-800">
                    <AvatarImage src={n.actor?.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs font-bold">
                    </AvatarFallback>
                </Avatar>
                <div className={cn("absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center", cfg.bg)}>
                    <Icon className={cn("w-3 h-3", cfg.color)} />
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <p className="text-sm text-zinc-200 leading-snug">
                    {n.actor && (
                        <span className="font-semibold text-white">
                            {n.actor.name}{" "}
                        </span>
                    )}
                    {n.body ?? cfg.label}
                </p>
                <p className="text-sm text-zinc-500 mt-0.5">
                    {formatRelativeTime(new Date(n.createdAt).toISOString())}
                </p>
            </div>

            {/* One-tap copy: trade/callout alerts carry the token slug in
                postId — jump straight to the token page's swap card. */}
            {(n.type === "trade" || n.type === "callout") && n.postId && (
                <Link
                    href={`/coin/${n.postId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 rounded-full bg-lantern/10 px-3 py-1.5 text-xs font-bold text-lantern hover:bg-lantern/20 transition-colors"
                >
                    {n.type === "trade" ? "Copy" : "View"}
                </Link>
            )}

            {!n.isRead && (
                <div className="w-2 h-2 rounded-full bg-notification shrink-0" />
            )}
        </div>
    )
}
