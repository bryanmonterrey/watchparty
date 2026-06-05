"use client"

import { X } from "lucide-react"
import { SearchIcon } from "@/components/icons"

interface NotificationSearchProps {
    searchQuery: string
    onSearchChange: (query: string) => void
}

export function NotificationSearch({ searchQuery, onSearchChange }: NotificationSearchProps) {
    return (
        <div className="px-5 pb-4 shrink-0">
            <div className="relative flex items-center backdrop-blur-xl inner-shadow inner-shadow-blur-sm inner-shadow-white/50 bg-zinc-500/35 rounded-full border border-transparent focus-within:border-zinc-700 focus-within:ring-2 focus-within:ring-twitter2 transition-all">
                <SearchIcon className="absolute left-4 w-[18px] h-[18px] text-zinc-400" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Search notifications..."
                    className="w-full bg-transparent pl-11 pr-10 py-2.5 text-[17px] font-medium text-white placeholder:text-zinc-500 focus:outline-none"
                />
                {searchQuery && (
                    <button 
                        onClick={() => onSearchChange("")}
                        className="absolute right-3 p-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>
        </div>
    )
}
