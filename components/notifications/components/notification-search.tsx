"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { SearchIcon } from "@/components/icons"

interface NotificationSearchProps {
    searchQuery: string
    onSearchChange: (query: string) => void
}

export function NotificationSearch({ searchQuery, onSearchChange }: NotificationSearchProps) {
    return (
        <div className="shrink-0 px-5 pb-3">
            {/* Flat fill + a uniform inner hairline, not the old translucent
                grey with an inset-shadow blur: on a dark surface that read as a
                stray highlight, which the design language rules out. Focus is
                the panel's blue, so the accent shows up on interaction too. */}
            <div className="relative flex h-11 items-center rounded-full bg-white/[0.04] ring-1 ring-white/10 transition-all focus-within:bg-white/[0.06] focus-within:ring-2 focus-within:ring-twitter">
                <SearchIcon className="absolute left-4 h-[18px] w-[18px] text-zinc-500" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search notifications..."
                    className="w-full bg-transparent py-2.5 pl-11 pr-10 text-[15px] font-medium text-white placeholder:text-zinc-500 focus:outline-none"
                />
                {searchQuery && (
                    <button
                        onClick={() => onSearchChange("")}
                        aria-label="Clear search"
                        className="absolute right-3 cursor-pointer rounded-full p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <HugeiconsIcon icon={Cancel01Icon} className="size-4" strokeWidth={2} />
                    </button>
                )}
            </div>
        </div>
    )
}
