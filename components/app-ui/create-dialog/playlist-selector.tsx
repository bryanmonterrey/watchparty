"use client"

import * as React from "react"
import { Check, ChevronDown, Plus, Globe, Lock, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CreatePlaylistDialog } from "./create-playlist-dialog"

import { trpc } from "@/lib/trpc/client"
import { toast } from "sonner"

export interface Playlist {
    id: string
    title: string
    visibility: "public" | "private" | "unlisted"
}

interface PlaylistSelectorProps {
    selectedPlaylists: string[]
    onSelect: (ids: string[]) => void
}

export function PlaylistSelector({ selectedPlaylists, onSelect }: PlaylistSelectorProps) {
    const [open, setOpen] = React.useState(false)
    const [isCreating, setIsCreating] = React.useState(false)

    // Data Fetching
    const { data: playlists = [], isLoading } = trpc.content.getMyPlaylists.useQuery()
    const utils = trpc.useContext() // For invalidation

    // Mutations
    const createPlaylistMutation = trpc.content.createPlaylist.useMutation({
        onSuccess: () => {
            utils.content.getMyPlaylists.invalidate()
            toast.success("Playlist created")
        },
        onError: () => {
            toast.error("Failed to create playlist")
        }
    })

    const togglePlaylist = (id: string) => {
        if (selectedPlaylists.includes(id)) {
            onSelect(selectedPlaylists.filter((pid) => pid !== id))
        } else {
            onSelect([...selectedPlaylists, id])
        }
    }

    const selectedLabels = playlists
        .filter((p) => selectedPlaylists.includes(p.id))
        .map((p) => p.title)

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div
                    className={cn(
                        "w-full flex h-12 items-center justify-between rounded-full border border-zinc-700 bg-transparent px-4 py-2 text-md ring-offset-background placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer text-zinc-300 hover:bg-zinc-800/50 transition-colors"
                    )}
                    style={{ borderRadius: '9999px' }}
                >
                    <span className="truncate">
                        {selectedLabels.length > 0
                            ? selectedLabels.join(", ")
                            : "Select"}
                    </span>
                    <ChevronDown className="h-5 w-5 opacity-50" />
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0 bg-zinc-900 border-zinc-800 shadow-xl" align="start">
                {/* Content */}
                <div className="p-0">
                    <ScrollArea className="h-[200px]">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-[200px] text-zinc-500">
                                <span className="animate-pulse">Loading...</span>
                            </div>
                        ) : playlists.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-[200px] text-zinc-500 gap-2">
                                <p>No playlists available</p>
                            </div>
                        ) : (
                            <div className="p-1">
                                {playlists.map((playlist) => (
                                    <div
                                        key={playlist.id}
                                        onClick={() => togglePlaylist(playlist.id)}
                                        className="flex items-center gap-2 px-2 py-2 hover:bg-zinc-800 rounded-sm cursor-pointer group"
                                    >
                                        <div className={cn(
                                            "flex items-center justify-center w-4 h-4 rounded border border-zinc-600 transition-colors",
                                            selectedPlaylists.includes(playlist.id) ? "bg-lantern border-lantern text-black" : "group-hover:border-zinc-500"
                                        )}>
                                            {selectedPlaylists.includes(playlist.id) && <Check className="w-3 h-3 stroke-[3]" />}
                                        </div>
                                        <span className="text-sm text-zinc-300 truncate flex-1">{playlist.title}</span>
                                        {playlist.visibility === "private" && <Lock className="w-3 h-3 text-zinc-600" />}
                                        {playlist.visibility === "unlisted" && <EyeOff className="w-3 h-3 text-zinc-600" />}
                                        {playlist.visibility === "public" && <Globe className="w-3 h-3 text-zinc-600" />}
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-2 border-t border-zinc-800 bg-zinc-900">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsCreating(true)}
                        className="h-8 px-2 text-zinc-300 hover:text-white hover:bg-zinc-800 gap-1"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="text-xs font-medium">Create playlist</span>
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOpen(false)}
                        className="h-8 px-3 rounded-full bg-transparent text-blue-400 hover:bg-blue-400/10 hover:text-blue-300 text-xs font-semibold"
                    >
                        Done
                    </Button>
                </div>
            </PopoverContent>

            <CreatePlaylistDialog
                open={isCreating}
                onOpenChange={setIsCreating}
                onCreate={(newPlaylist) => {
                    createPlaylistMutation.mutate({
                        title: newPlaylist.title,
                        description: newPlaylist.description,
                        visibility: newPlaylist.visibility as any
                    }, {
                        onSuccess: (data) => {
                            // Auto select
                            onSelect([...selectedPlaylists, data.playlistId])
                            setIsCreating(false)
                        }
                    })
                }}
            />
        </Popover>
    )
}
