"use client"

import * as React from "react"
import { Search, X } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc/client"
import type { AllowedCommenter } from "./types"

interface CommenterPickerProps {
    whoCanComment: "everyone" | "followers" | "verified" | "none"
    comments: string
    allowedCommenters: AllowedCommenter[]
    onChange: (c: AllowedCommenter[]) => void
}

export function CommenterPicker({ whoCanComment, comments, allowedCommenters, onChange }: CommenterPickerProps) {
    const [commenterSearch, setCommenterSearch] = React.useState("")
    const [commenterSearchOpen, setCommenterSearchOpen] = React.useState(false)

    const commenterSearchQuery = trpc.user.search.useQuery(
        { query: commenterSearch, limit: 6 },
        { enabled: commenterSearch.length >= 2 }
    )

    return (
        <div className="space-y-3 pt-1">
            <Label className="text-xs text-zinc-500">Who can comment</Label>
            <div className="flex flex-wrap gap-2">
                {([
                    { value: "everyone", label: "Everyone" },
                    { value: "followers", label: "Followers" },
                    { value: "verified", label: "Verified" },
                    { value: "none", label: "No one" },
                ] as const).map(opt => (
                    <button
                        key={opt.value}
                        disabled={comments === "off"}
                        className={cn(
                            "px-5 py-2 rounded-full text-md font-medium border transition-all disabled:opacity-40",
                            whoCanComment === opt.value
                                ? "bg-white text-black border-white"
                                : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                        )}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>
            {whoCanComment !== "none" && whoCanComment !== "everyone" && comments !== "off" && (
                <div className="space-y-2">
                    <p className="text-xs text-zinc-500">Or add specific users who can comment</p>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                        <input
                            value={commenterSearch}
                            onChange={e => { setCommenterSearch(e.target.value); setCommenterSearchOpen(true) }}
                            onFocus={() => setCommenterSearchOpen(true)}
                            placeholder="Search users..."
                            className="w-full h-9 pl-8 pr-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                        />
                        {commenterSearchOpen && commenterSearch.length >= 2 && (
                            <div className="absolute top-10 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50">
                                {commenterSearchQuery.data?.users.map(u => (
                                    <button
                                        key={u.id}
                                        onClick={() => {
                                            if (!allowedCommenters.find(c => c.id === u.id)) {
                                                onChange([...allowedCommenters, { id: u.id, name: u.name || u.email || "", avatar_url: u.avatar_url || undefined }])
                                            }
                                            setCommenterSearch("")
                                            setCommenterSearchOpen(false)
                                        }}
                                        className="flex items-center gap-2.5 w-full px-3 py-2 hover:bg-white/5 transition-colors text-left"
                                    >
                                        <Avatar className="w-7 h-7">
                                            <AvatarImage src={u.avatar_url || ""} />
                                            <AvatarFallback className="text-xs bg-zinc-800"></AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="text-sm text-white font-medium">{u.name}</p>
                                            {u.username && <p className="text-xs text-zinc-500">@{u.username}</p>}
                                        </div>
                                    </button>
                                ))}
                                {commenterSearchQuery.data?.users.length === 0 && (
                                    <p className="px-3 py-2 text-xs text-zinc-500">No users found</p>
                                )}
                            </div>
                        )}
                    </div>
                    {allowedCommenters.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                            {allowedCommenters.map(u => (
                                <div key={u.id} className="flex items-center gap-1.5 bg-zinc-800 rounded-full pl-1 pr-2 py-1">
                                    <Avatar className="w-5 h-5">
                                        <AvatarImage src={u.avatar_url || ""} />
                                        <AvatarFallback className="text-[10px] bg-zinc-700"></AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs text-zinc-300">{u.name}</span>
                                    <button onClick={() => onChange(allowedCommenters.filter(c => c.id !== u.id))} className="text-zinc-500 hover:text-white">
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
