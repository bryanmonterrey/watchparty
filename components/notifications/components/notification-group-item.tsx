"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { formatRelativeTime } from "@/lib/date-utils"
import { TYPE_CONFIG } from "../types"
import { describeGroup, type NotificationGroup } from "@/lib/notifications/group"

// A grouped row (lib/notifications/group): two stacked avatars where the
// single row has one, the type badge on the front one, and the combined
// sentence — "A, B and 3 others liked your post". Tapping marks every member
// read. Same geometry as NotificationItem so the list reads as one.
export function NotificationGroupItem({ group: g, onMarkRead }: { group: NotificationGroup; onMarkRead: (id: string) => void }) {
    const cfg = TYPE_CONFIG[g.type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.system
    const Icon = cfg.icon
    const [front, back] = g.actors

    return (
        <div
            onClick={() => { if (!g.isRead) for (const id of g.ids) onMarkRead(id) }}
            className={cn(
                "flex items-center gap-3 px-5 py-3 hover:bg-zinc-900/60 transition-colors cursor-default",
                !g.isRead && "bg-zinc-900/30",
            )}
        >
            <div className="relative size-10 shrink-0">
                {back && (
                    <Avatar className="absolute right-0 top-0 size-7 border border-zinc-800">
                        <AvatarImage src={back.avatar_url ?? undefined} />
                        <AvatarFallback className="bg-zinc-800" />
                    </Avatar>
                )}
                <Avatar className={cn("absolute border border-zinc-800", back ? "bottom-0 left-0 size-7 ring-2 ring-canvas" : "inset-0 size-10")}>
                    <AvatarImage src={front?.avatar_url ?? undefined} />
                    <AvatarFallback className="bg-zinc-800" />
                </Avatar>
                <div className={cn("absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full", cfg.bg)}>
                    <Icon className={cn("size-3", cfg.color)} fill={cfg.filled ? "currentColor" : "none"} />
                </div>
            </div>

            <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-zinc-200">{describeGroup(g)}</p>
                <p className="mt-0.5 text-sm text-zinc-500">{formatRelativeTime(new Date(g.createdAt).toISOString())}</p>
            </div>

            {!g.isRead && <div className="size-2 shrink-0 rounded-full bg-notification" />}
        </div>
    )
}
