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
import { GooDropdown } from "@/components/ui/goo-dropdown"
import { Check, ChevronDown } from "lucide-react"

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
            <DialogContent className="border-zinc-800 text-white max-w-[600px] p-0 gap-0">
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
                            className="h-14 pt-4"
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
                            <GooDropdown
                                className="w-full"
                                align="start"
                                width={240}
                                gap={8}
                                fill="#282828"
                                buttonRadius={8}
                                panelRadius={12}
                                triggerClassName="flex h-12 w-full items-center justify-between rounded-md border border-zinc-600 bg-transparent px-3 text-sm text-zinc-200"
                                trigger={
                                    <>
                                        {visibility === "public" && "Public"}
                                        {visibility === "private" && "Private"}
                                        {visibility === "unlisted" && "Unlisted"}
                                        <ChevronDown className="h-4 w-4 opacity-50" />
                                    </>
                                }
                                items={([
                                    { value: "public", label: "Public" },
                                    { value: "private", label: "Private" },
                                    { value: "unlisted", label: "Unlisted" },
                                ] as const).map((opt) => ({
                                    key: opt.value,
                                    onClick: () => setVisibility(opt.value),
                                    className: "justify-between text-zinc-200 hover:bg-white/10",
                                    label: (
                                        <>
                                            {opt.label}
                                            {visibility === opt.value && <Check className="h-4 w-4" />}
                                        </>
                                    ),
                                }))}
                            />
                        </div>
                        <div className="flex-1 space-y-1">
                            <Label className="text-xs text-zinc-400 ml-1">Default video order</Label>
                            <GooDropdown
                                className="w-full"
                                align="start"
                                width={260}
                                gap={8}
                                fill="#282828"
                                buttonRadius={8}
                                panelRadius={12}
                                triggerClassName="flex h-12 w-full items-center justify-between rounded-md border border-zinc-600 bg-transparent px-3 text-sm text-zinc-200"
                                trigger={
                                    <>
                                        {sortOrder === "newest" && "Date published (newest)"}
                                        {sortOrder === "oldest" && "Date published (oldest)"}
                                        {sortOrder === "popular" && "Most popular"}
                                        <ChevronDown className="h-4 w-4 opacity-50" />
                                    </>
                                }
                                items={([
                                    { value: "newest", label: "Date published (newest)" },
                                    { value: "oldest", label: "Date published (oldest)" },
                                    { value: "popular", label: "Most popular" },
                                ] as const).map((opt) => ({
                                    key: opt.value,
                                    onClick: () => setSortOrder(opt.value),
                                    className: "justify-between text-zinc-200 hover:bg-white/10",
                                    label: (
                                        <>
                                            {opt.label}
                                            {sortOrder === opt.value && <Check className="h-4 w-4" />}
                                        </>
                                    ),
                                }))}
                            />
                        </div>
                    </div>

                    {/* Language */}
                    <div className="space-y-1">
                        <Label className="text-xs text-zinc-400 ml-1">Language</Label>
                        <button
                            type="button"
                            disabled
                            className="flex h-12 w-full items-center justify-between rounded-md border border-zinc-600 bg-transparent px-3 text-sm opacity-50 cursor-not-allowed"
                        >
                            <span className="text-zinc-400">Title and description language</span>
                            <ChevronDown className="h-4 w-4 opacity-50" />
                        </button>
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
