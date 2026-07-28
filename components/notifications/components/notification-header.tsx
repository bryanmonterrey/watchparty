"use client"

import { X, CheckCheck } from "lucide-react"

interface NotificationHeaderProps {
    unreadCount: number
    onMarkAllRead: () => void
    onClose: () => void
}

export function NotificationHeader({ unreadCount, onMarkAllRead, onClose }: NotificationHeaderProps) {
    return (
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
            <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-bold text-white">Notifications</h2>
                {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 min-w-[22px] text-center rounded-full bg-twitter2 text-white text-xs font-bold">
                        {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                    <button
                        onClick={onMarkAllRead}
                        className="flex hidden items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded-full hover:bg-white/5 cursor-pointer"
                    >
                        <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                    </button>
                )}
                <button
                    onClick={onClose}
                    className="bg-white/5 rounded-full p-2 opacity-70 transition-opacity hover:opacity-100 cursor-pointer"
                >
                    <X height={20} width={20} />
                </button>
            </div>
        </div>
    )
}
