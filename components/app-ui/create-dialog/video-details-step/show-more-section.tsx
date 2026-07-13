"use client"

import * as React from "react"
import { ChevronDown, ChevronUp, CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { GooDropdown } from "@/components/ui/goo-dropdown"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { CollaboratorPicker } from "./collaborator-picker"
import { LanguagePicker } from "./language-picker"
import { CommenterPicker } from "./commenter-picker"
import type { Collaborator, AllowedCommenter } from "./types"

const CATEGORY_OPTIONS = [
    { value: "Just Chatting", label: "Just Chatting" },
    { value: "Music", label: "Music" },
    { value: "Gaming", label: "Gaming" },
    { value: "Games", label: "Games" },
    { value: "Esports", label: "Esports" },
    { value: "Tech", label: "Tech" },
    { value: "Creative", label: "Creative" },
    { value: "Sports", label: "Sports" },
    { value: "IRL", label: "IRL" },
    { value: "Live", label: "Live" },
    { value: "News", label: "News" },
    { value: "Memes", label: "Memes" },
    { value: "Political", label: "Political" },
    { value: "GTAV", label: "GTAV" },
    { value: "Fortnite", label: "Fortnite" },
    { value: "Pranks", label: "Pranks" },
    { value: "Trending", label: "Trending" },
    { value: "Travel", label: "Travel" },
    { value: "Food", label: "Food & Cooking" },
    { value: "Education", label: "Education" },
    { value: "Fitness", label: "Fitness" },
    { value: "People", label: "People & Blogs" },
]

interface ShowMoreSectionProps {
    autoChapters: boolean
    setAutoChapters: (v: boolean) => void
    autoPlaces: boolean
    setAutoPlaces: (v: boolean) => void
    remixing: string
    setRemixing: (v: string) => void
    comments: string
    setComments: (v: string) => void
    commentModeration: string
    setCommentModeration: (v: string) => void
    commentSort: string
    setCommentSort: (v: string) => void
    showLikeCount: boolean
    setShowLikeCount: (v: boolean) => void
    captionCertification: string
    setCaptionCertification: (v: string) => void
    recordingDate: Date | undefined
    setRecordingDate: (v: Date | undefined) => void
    videoLocation: string
    setVideoLocation: (v: string) => void
    license: string
    setLicense: (v: string) => void
    allowEmbedding: boolean
    setAllowEmbedding: (v: boolean) => void
    publishToFeed: boolean
    setPublishToFeed: (v: boolean) => void
    category: string
    setCategory: (v: string) => void
    languages: string[]
    onLanguagesChange: (langs: string[]) => void
    collaborators: Collaborator[]
    onCollaboratorsChange: (c: Collaborator[]) => void
    whoCanComment: "everyone" | "followers" | "verified" | "none"
    setWhoCanComment: (v: "everyone" | "followers" | "verified" | "none") => void
    allowedCommenters: AllowedCommenter[]
    onAllowedCommentersChange: (c: AllowedCommenter[]) => void
}

export function ShowMoreSection({
    autoChapters, setAutoChapters,
    autoPlaces, setAutoPlaces,
    remixing, setRemixing,
    comments, setComments,
    commentModeration, setCommentModeration,
    commentSort, setCommentSort,
    showLikeCount, setShowLikeCount,
    captionCertification, setCaptionCertification,
    recordingDate, setRecordingDate,
    videoLocation, setVideoLocation,
    license, setLicense,
    allowEmbedding, setAllowEmbedding,
    publishToFeed, setPublishToFeed,
    category, setCategory,
    languages, onLanguagesChange,
    collaborators, onCollaboratorsChange,
    whoCanComment, setWhoCanComment,
    allowedCommenters, onAllowedCommentersChange,
}: ShowMoreSectionProps) {
    const [showMore, setShowMore] = React.useState(false)

    return (
        <div className="pt-4">
            <button
                onClick={() => setShowMore(!showMore)}
                className="flex items-center cursor-pointer gap-2 bg-white/15 text-sm font-medium text-white rounded-full px-4 py-2 transition-colors"
            >
                {showMore ? "Show less" : "Show more"}
                {showMore ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            <AnimatePresence>
                {showMore && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden px-2"
                    >
                        <div className="space-y-8 pt-6 pb-2">
                            {/* Paid Promotion */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-zinc-300">Paid promotion</h3>
                                <div className="flex items-start space-x-2">
                                    <Checkbox id="paid" className="mt-1 border-zinc-600 rounded-full data-[state=checked]:bg-twitter2 data-[state=checked]:border-white/50" />
                                    <div className="grid gap-1.5 leading-none">
                                        <Label htmlFor="paid" className="text-sm font-normal text-zinc-300 leading-snug">
                                            My video contains paid promotion like a product placement, sponsorship, or endorsement
                                        </Label>
                                    </div>
                                </div>
                            </div>

                            {/* Collaboration */}
                            <CollaboratorPicker collaborators={collaborators} onChange={onCollaboratorsChange} />

                            {/* Automatic Chapters */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-zinc-300">Automatic chapters</h3>
                                <p className="text-xs text-zinc-500">
                                    Chapters and key moments make your video easier to watch. You can overwrite automatic suggestions by creating your own chapters in the video description. <a href="#" className="text-blue-500 hover:underline">Learn more</a>
                                </p>
                                <div className="flex items-start space-x-2">
                                    <Checkbox
                                        id="autoChapters"
                                        checked={autoChapters}
                                        onCheckedChange={(c) => setAutoChapters(c as boolean)}
                                        className="mt-1 border-zinc-600 data-[state=checked]:bg-twitter2 rounded-full data-[state=checked]:border-white/50"
                                    />
                                    <Label htmlFor="autoChapters" className="text-sm font-normal text-zinc-300 leading-snug pt-1">
                                        Allow automatic chapters and key moments
                                    </Label>
                                </div>
                            </div>

                            {/* Featured Places */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-zinc-300">Featured places</h3>
                                <p className="text-xs text-zinc-500">
                                    Help viewers explore key places in your video. These are public places like restaurants and shops – we don't display your current location or other private info. <a href="#" className="text-blue-500 hover:underline">Learn more</a>
                                </p>
                                <div className="flex items-start space-x-2">
                                    <Checkbox
                                        id="autoPlaces"
                                        checked={autoPlaces}
                                        onCheckedChange={(c) => setAutoPlaces(c as boolean)}
                                        className="mt-1 border-zinc-600 data-[state=checked]:bg-twitter2 rounded-full data-[state=checked]:border-white/50"
                                    />
                                    <Label htmlFor="autoPlaces" className="text-sm font-normal text-zinc-300 leading-snug pt-1">
                                        Allow automatic places
                                    </Label>
                                </div>
                            </div>

                            {/* Tags */}
                            <div className="space-y-2">
                                <h3 className="text-sm font-medium text-zinc-300">Tags</h3>
                                <p className="text-xs text-zinc-500">Tags can be useful if content in your video is commonly misspelled.</p>
                                <Input placeholder="Add tag" className="h-12" />
                                <p className="text-xs text-zinc-600 text-right">0/500</p>
                            </div>

                            {/* Language and Captions */}
                            <LanguagePicker languages={languages} onChange={onLanguagesChange} />

                            {/* License */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-zinc-300">License</h3>
                                <p className="text-xs text-zinc-500">Learn about <a href="#" className="text-blue-500 hover:underline">license types</a>.</p>

                                <div className="space-y-4">
                                    <GooDropdown
                                        className="w-full"
                                        align="start"
                                        width={300}
                                        gap={8}
                                        fill="#18181b"
                                        panelRadius={12}
                                        triggerClassName="flex w-full text-md h-12 items-center justify-between rounded-full border border-zinc-700 bg-transparent px-4 text-zinc-300"
                                        trigger={
                                            <>
                                                {license === "standard" ? "Standard Watchparty License" : "Creative Commons - Attribution"}
                                                <ChevronDown className="h-4 w-4 opacity-50" />
                                            </>
                                        }
                                        items={([
                                            { value: "standard", label: "Standard Watchparty License" },
                                            { value: "cc", label: "Creative Commons - Attribution" },
                                        ] as const).map((opt) => ({
                                            key: opt.value,
                                            onClick: () => setLicense(opt.value),
                                            className: "text-zinc-300 hover:bg-white/10",
                                            label: opt.label,
                                        }))}
                                    />

                                    <div className="flex items-start space-x-2">
                                        <Checkbox
                                            id="embedding"
                                            checked={allowEmbedding}
                                            onCheckedChange={(c) => setAllowEmbedding(c as boolean)}
                                            className="mt-1 border-zinc-600 rounded-full data-[state=checked]:bg-twitter2 data-[state=checked]:border-white/50"
                                        />
                                        <Label htmlFor="embedding" className="text-sm font-normal text-zinc-300 leading-snug pt-1">
                                            Allow embedding
                                        </Label>
                                    </div>
                                    <div className="flex items-start space-x-2">
                                        <Checkbox
                                            id="publishFeed"
                                            checked={publishToFeed}
                                            onCheckedChange={(c) => setPublishToFeed(c as boolean)}
                                            className="mt-1 border-zinc-600 rounded-full data-[state=checked]:bg-twitter2 data-[state=checked]:border-white/50"
                                        />
                                        <Label htmlFor="publishFeed" className="text-sm font-normal text-zinc-300 leading-snug pt-1">
                                            Publish to followers feed and notify followers
                                        </Label>
                                    </div>
                                </div>
                            </div>

                            {/* Recording Date and Location */}
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium text-zinc-300">Recording date and location</h3>
                                    <p className="text-xs text-zinc-500">Add when and where your video was recorded</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-zinc-500">Recording date</Label>
                                        <Popover>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    variant="outline"
                                                    className={cn(
                                                        "w-full h-12 rounded-full justify-start text-left font-normal bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors",
                                                        !recordingDate && "text-zinc-500"
                                                    )}
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                                    {recordingDate ? format(recordingDate, "PPP") : <span>Pick a date</span>}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-800 text-zinc-300">
                                                <Calendar
                                                    mode="single"
                                                    selected={recordingDate}
                                                    onSelect={setRecordingDate}
                                                    className="bg-zinc-900 pointer-events-auto"
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-zinc-500">Video location</Label>
                                        <Input
                                            value={videoLocation}
                                            onChange={(e) => setVideoLocation(e.target.value)}
                                            placeholder="Search location"
                                            className="h-12 text-md px-4 rounded-full bg-transparent border-zinc-700 text-zinc-300 focus:border-lantern/50"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Shorts Remixing */}
                            <div className="space-y-3">
                                <h3 className="text-sm font-medium text-zinc-300">Shorts remixing</h3>
                                <p className="text-xs text-zinc-500">
                                    Let others create Shorts using content from this video. <a href="#" className="text-blue-500 hover:underline">Learn more</a>
                                </p>
                                <RadioGroup value={remixing} onValueChange={setRemixing} className="space-y-3">
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="video-audio" id="video-audio" className="border-zinc-600 text-white" />
                                        <Label htmlFor="video-audio" className="font-normal text-zinc-300">Allow video and audio remixing</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="audio-only" id="audio-only" className="border-zinc-600 text-white" />
                                        <Label htmlFor="audio-only" className="font-normal text-zinc-300">Allow only audio remixing</Label>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                        <RadioGroupItem value="none" id="none" className="border-zinc-600 text-white" />
                                        <Label htmlFor="none" className="font-normal text-zinc-300">Don't allow remixing</Label>
                                    </div>
                                </RadioGroup>
                            </div>

                            {/* Category */}
                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium text-zinc-300">Category</h3>
                                    <p className="text-xs text-zinc-500">Add your video to a category so viewers can find it more easily</p>
                                </div>
                                <GooDropdown
                                    className="w-full"
                                    align="start"
                                    width={300}
                                    gap={8}
                                    fill="#18181b"
                                    panelRadius={12}
                                    maxPanelHeight={240}
                                    triggerClassName="flex w-full h-12 items-center justify-between rounded-full border border-zinc-700 bg-transparent px-4 text-zinc-300"
                                    trigger={
                                        <>
                                            <span className={category ? undefined : "text-zinc-500"}>
                                                {category ? (CATEGORY_OPTIONS.find((o) => o.value === category)?.label ?? category) : "Select a category"}
                                            </span>
                                            <ChevronDown className="h-4 w-4 opacity-50" />
                                        </>
                                    }
                                    items={CATEGORY_OPTIONS.map((opt) => ({
                                        key: opt.value,
                                        onClick: () => setCategory(opt.value),
                                        className: "text-zinc-300 hover:bg-white/10",
                                        label: opt.label,
                                    }))}
                                />
                            </div>

                            {/* Comments and Ratings */}
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <h3 className="text-sm font-medium text-zinc-300">Comments and ratings</h3>
                                    <p className="text-xs text-zinc-500">Choose if and how you want to show comments</p>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-zinc-500">Comments</Label>
                                        <GooDropdown
                                            className="w-full"
                                            align="start"
                                            width={180}
                                            gap={8}
                                            fill="#18181b"
                                            panelRadius={12}
                                            triggerClassName="flex w-full h-12 items-center justify-between rounded-full border border-zinc-700 bg-transparent px-4 text-zinc-300"
                                            trigger={
                                                <>
                                                    {comments === "on" ? "On" : "Off"}
                                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                                </>
                                            }
                                            items={([
                                                { value: "on", label: "On" },
                                                { value: "off", label: "Off" },
                                            ] as const).map((opt) => ({
                                                key: opt.value,
                                                onClick: () => setComments(opt.value),
                                                className: "text-zinc-300 hover:bg-white/10",
                                                label: opt.label,
                                            }))}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-zinc-500">Moderation</Label>
                                        <GooDropdown
                                            className="w-full"
                                            align="start"
                                            width={180}
                                            gap={8}
                                            fill="#18181b"
                                            panelRadius={12}
                                            disabled={comments === "off"}
                                            triggerClassName="flex w-full h-12 items-center justify-between rounded-full border border-zinc-700 bg-transparent px-4 text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                            trigger={
                                                <>
                                                    {commentModeration === "basic" && "Basic"}
                                                    {commentModeration === "strict" && "Strict"}
                                                    {commentModeration === "hold" && "Hold all"}
                                                    {commentModeration === "none" && "None"}
                                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                                </>
                                            }
                                            items={([
                                                { value: "basic", label: "Basic" },
                                                { value: "strict", label: "Strict" },
                                                { value: "hold", label: "Hold all" },
                                                { value: "none", label: "None" },
                                            ] as const).map((opt) => ({
                                                key: opt.value,
                                                onClick: () => setCommentModeration(opt.value),
                                                className: "text-zinc-300 hover:bg-white/10",
                                                label: opt.label,
                                            }))}
                                        />
                                    </div>
                                </div>

                                {/* Who can comment */}
                                <CommenterPicker
                                    whoCanComment={whoCanComment}
                                    comments={comments}
                                    allowedCommenters={allowedCommenters}
                                    onChange={onAllowedCommentersChange}
                                />

                                <div className="pt-2 flex flex-col gap-4">
                                    <div className="w-[calc(50%-8px)] space-y-1">
                                        <Label className="text-xs text-zinc-500">Sort by</Label>
                                        <GooDropdown
                                            className="w-full"
                                            align="start"
                                            width={180}
                                            gap={8}
                                            fill="#18181b"
                                            panelRadius={12}
                                            disabled={comments === "off"}
                                            triggerClassName="flex w-full h-12 items-center justify-between rounded-full border border-zinc-700 bg-transparent px-4 text-zinc-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                            trigger={
                                                <>
                                                    {commentSort === "top" ? "Top" : "Newest"}
                                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                                </>
                                            }
                                            items={([
                                                { value: "top", label: "Top" },
                                                { value: "newest", label: "Newest" },
                                            ] as const).map((opt) => ({
                                                key: opt.value,
                                                onClick: () => setCommentSort(opt.value),
                                                className: "text-zinc-300 hover:bg-white/10",
                                                label: opt.label,
                                            }))}
                                        />
                                    </div>

                                    <div className="flex items-start space-x-2">
                                        <Checkbox
                                            id="showLikes"
                                            checked={showLikeCount}
                                            onCheckedChange={(c) => setShowLikeCount(c as boolean)}
                                            className="mt-1 border-zinc-600  data-[state=checked]:bg-twitter2 rounded-full data-[state=checked]:border-white/50"
                                        />
                                        <Label htmlFor="showLikes" className="text-sm font-normal text-zinc-300 leading-snug pt-1">
                                            Show how many viewers like this video
                                        </Label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
