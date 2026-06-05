"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogClose,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface CreatePlaylistDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onCreate: (playlist: { title: string; description: string; visibility: string }) => void
}

export function CreatePlaylistDialog({ open, onOpenChange, onCreate }: CreatePlaylistDialogProps) {
    const [title, setTitle] = React.useState("")
    const [description, setDescription] = React.useState("")
    const [visibility, setVisibility] = React.useState("public")
    const [sortOrder, setSortOrder] = React.useState("newest")

    const handleCreate = () => {
        if (!title.trim()) return
        onCreate({ title, description, visibility })
        onOpenChange(false)

        // Reset form
        setTitle("")
        setDescription("")
        setVisibility("public")
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#282828] border-zinc-800 text-white max-w-[600px] p-0 gap-0">
                <DialogHeader className="p-6 pb-4 border-b border-white/10">
                    <DialogTitle className="text-xl font-semibold">Create a new playlist</DialogTitle>
                </DialogHeader>

                <div className="p-6 space-y-6">
                    {/* Title */}
                    <div className="relative group">
                        <div className="absolute left-3 top-2 text-xs text-zinc-400">Title (required)</div>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="h-14 pt-4 bg-transparent border-zinc-600 focus:border-blue-400 rounded transition-colors placeholder:text-zinc-500"
                            placeholder="Add title"
                        />
                        <div className="text-right text-xs text-zinc-400 mt-1">{title.length}/150</div>
                    </div>

                    {/* Description */}
                    <div className="relative group">
                        <div className="absolute left-3 top-2 text-xs text-zinc-400">Description</div>
                        <Textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="min-h-[120px] pt-6 bg-transparent border-zinc-600 focus:border-blue-400 rounded resize-none placeholder:text-zinc-500"
                            placeholder="Add description"
                            maxLength={5000}
                        />
                        <div className="text-right text-xs text-zinc-400 mt-1">{description.length}/5000</div>
                    </div>

                    {/* Visibility & Sort Order */}
                    <div className="flex gap-4">
                        <div className="flex-1 space-y-1">
                            <Label className="text-xs text-zinc-400 ml-1">Visibility</Label>
                            <Select value={visibility} onValueChange={setVisibility}>
                                <SelectTrigger className="h-12 bg-transparent border-zinc-600 focus:ring-0 focus:border-blue-400">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#282828] border-zinc-700 text-zinc-200">
                                    <SelectItem value="public">Public</SelectItem>
                                    <SelectItem value="private">Private</SelectItem>
                                    <SelectItem value="unlisted">Unlisted</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex-1 space-y-1">
                            <Label className="text-xs text-zinc-400 ml-1">Default video order</Label>
                            <Select value={sortOrder} onValueChange={setSortOrder}>
                                <SelectTrigger className="h-12 bg-transparent border-zinc-600 focus:ring-0 focus:border-blue-400">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-[#282828] border-zinc-700 text-zinc-200">
                                    <SelectItem value="newest">Date published (newest)</SelectItem>
                                    <SelectItem value="oldest">Date published (oldest)</SelectItem>
                                    <SelectItem value="popular">Most popular</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Language */}
                    <div className="space-y-1">
                        <Label className="text-xs text-zinc-400 ml-1">Language</Label>
                        <Select disabled>
                            <SelectTrigger className="h-12 bg-transparent border-zinc-600 opacity-50 cursor-not-allowed">
                                <span className="text-zinc-400">Title and description language</span>
                            </SelectTrigger>
                        </Select>
                    </div>
                </div>

                <DialogFooter className="p-4 px-6 border-t border-white/10">
                    <Button
                        variant="ghost"
                        onClick={() => onOpenChange(false)}
                        className="text-white hover:bg-white/10 font-medium"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        className="bg-transparent text-blue-400 hover:bg-blue-400/10 hover:text-blue-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!title.trim()}
                    >
                        Create
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
