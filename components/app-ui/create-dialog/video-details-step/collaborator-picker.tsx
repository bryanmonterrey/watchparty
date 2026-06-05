"use client"

import * as React from "react"
import { Search, X } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { trpc } from "@/lib/trpc/client"
import type { Collaborator } from "./types"
import { SearchIcon } from "@/components/icons"

interface CollaboratorPickerProps {
    collaborators: Collaborator[]
    onChange: (c: Collaborator[]) => void
}

export function CollaboratorPicker({ collaborators, onChange }: CollaboratorPickerProps) {
    const [collaboratorSearch, setCollaboratorSearch] = React.useState("")
    const [collaboratorSearchOpen, setCollaboratorSearchOpen] = React.useState(false)

    const collaboratorSearchQuery = trpc.content.searchCollaborators.useQuery(
        { query: collaboratorSearch, limit: 6 },
        { enabled: collaboratorSearch.length >= 2 }
    )

    return (
        <div className="space-y-3">
            <h3 className="text-sm font-medium text-zinc-300">Collaboration</h3>
            <p className="text-xs text-zinc-500">
                Grow your audience by collaborating with other creators and expand your video's reach to their audiences.
            </p>
            <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
                <input
                    value={collaboratorSearch}
                    onChange={e => { setCollaboratorSearch(e.target.value); setCollaboratorSearchOpen(true) }}
                    onFocus={() => setCollaboratorSearchOpen(true)}
                    placeholder="Search creators to invite..."
                    className="w-full h-12 pl-10 pr-3 bg-zinc-800/50 border border-zinc-700 rounded-full text-md text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                />
                {collaboratorSearchOpen && collaboratorSearch.length >= 2 && (
                    <div className="absolute top-10 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50">
                        {collaboratorSearchQuery.data?.users.map(u => (
                            <button
                                key={u.id}
                                onClick={() => {
                                    if (!collaborators.find(c => c.id === u.id)) {
                                        onChange([...collaborators, { id: u.id, name: u.name || "", username: u.username || undefined, avatar_url: u.avatar_url || undefined }])
                                    }
                                    setCollaboratorSearch("")
                                    setCollaboratorSearchOpen(false)
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
                        {collaboratorSearchQuery.data?.users.length === 0 && (
                            <p className="px-3 py-2 text-xs text-zinc-500">No users found</p>
                        )}
                    </div>
                )}
            </div>
            {collaborators.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {collaborators.map(c => (
                        <div key={c.id} className="flex items-center gap-1.5 bg-zinc-800 rounded-full pl-1 pr-2 py-1">
                            <Avatar className="w-5 h-5">
                                <AvatarImage src={c.avatar_url || ""} />
                                <AvatarFallback className="text-[10px] bg-zinc-700"></AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-zinc-300">{c.name}</span>
                            <button onClick={() => onChange(collaborators.filter(co => co.id !== c.id))} className="text-zinc-500 hover:text-white">
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
