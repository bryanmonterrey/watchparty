"use client"

import * as React from "react"
import type { useCashtagField } from "@/components/browse/use-cashtag-field"
import { CashtagAutocomplete } from "@/components/browse/cashtag-autocomplete";
import { Image as ImageIcon, Globe, Users, BadgeCheck, Medal, ChevronDown, Check } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { GooDropdown } from "@/components/ui/goo-dropdown"
import { cn } from "@/lib/utils"
import { PlaylistSelector } from "../playlist-selector"
import { ShowMoreSection } from "./show-more-section"
import type { Collaborator, AllowedCommenter } from "./types"

interface DetailsStepProps {
    title: string
    setTitle: (v: string) => void
    /** Ticker tagging, owned by use-video-details so picks survive this step
     *  unmounting as the wizard advances. */
    titleTags: ReturnType<typeof useCashtagField>
    descTags: ReturnType<typeof useCashtagField>
    description: string
    setDescription: (v: string) => void
    thumbnailPreview: string | null
    isThumbnailDragActive: boolean
    isThumbnailUploading: boolean
    getThumbnailRootProps: () => React.HTMLAttributes<HTMLElement>
    getThumbnailInputProps: () => React.InputHTMLAttributes<HTMLInputElement>
    selectedPlaylists: string[]
    setSelectedPlaylists: (v: string[]) => void
    videoAudience: "everyone" | "followers" | "verified" | "token_holders"
    setVideoAudience: (v: "everyone" | "followers" | "verified" | "token_holders") => void
    // ShowMore props
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

export function DetailsStep({
    titleTags, descTags,
    title, setTitle,
    description, setDescription,
    thumbnailPreview,
    isThumbnailDragActive,
    isThumbnailUploading,
    getThumbnailRootProps,
    getThumbnailInputProps,
    selectedPlaylists, setSelectedPlaylists,
    videoAudience, setVideoAudience,
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
}: DetailsStepProps) {
    return (
        <div className="space-y-8 max-w-2xl mx-auto">
            {/* Title */}
            <div className="space-y-2">
                <div className="flex justify-between">
                    <Label className="text-sm font-medium text-zinc-300">Title (required)</Label>
                    <span className="text-xs text-zinc-500">{title.length}/100</span>
                </div>
                {/* A video IS a post, so a ticker typed here tags the coin the
                    same way it would from the composer — same menu, same
                    reference. `relative` is the menu's positioning context. */}
                <div className="relative group">
                    <Input
                        {...titleTags.inputProps}
                        ref={titleTags.ref as React.RefObject<HTMLInputElement>}
                        value={title}
                        className="h-12 pr-10"
                        maxLength={100}
                    />
                    {titleTags.open && (
                        <CashtagAutocomplete
                            top={48}
                            query={titleTags.query}
                            onSelect={titleTags.select}
                            onClose={() => titleTags.close()}
                            registerKeyHandler={(h) => { titleTags.keyHandler.current = h; }}
                        />
                    )}
                </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
                <div className="flex justify-between">
                    <Label className="text-sm font-medium text-zinc-300">Description</Label>
                    <span className="text-xs text-zinc-500">{description.length}/5000</span>
                </div>
                <div className="relative">
                    <Textarea
                        {...descTags.inputProps}
                        ref={descTags.ref as React.RefObject<HTMLTextAreaElement>}
                        value={description}
                        placeholder="Tell viewers about your video (type $ to tag a coin, @ to mention a channel)"
                        className="bg-transparent text-md rounded-3xl border-zinc-700 focus:border-twitter2/50 min-h-[120px] resize-none"
                        maxLength={5000}
                    />
                    {descTags.open && (
                        <CashtagAutocomplete
                            top={0}
                            query={descTags.query}
                            onSelect={descTags.select}
                            onClose={() => descTags.close()}
                            registerKeyHandler={(h) => { descTags.keyHandler.current = h; }}
                        />
                    )}
                </div>
            </div>

            {/* Thumbnail */}
            <div className="space-y-4">
                <Label className="text-sm font-medium text-zinc-300">Thumbnail</Label>
                <p className="text-xs text-zinc-500">Set a thumbnail that stands out and draws viewers' attention. Image will also be used as coin image</p>
                <div className="grid grid-cols-3 gap-4">
                    <div
                        {...getThumbnailRootProps()}
                        className={cn(
                            "flex flex-col items-center justify-center aspect-video border border-dashed rounded-xl transition-colors group cursor-pointer overflow-hidden relative",
                            isThumbnailDragActive ? "border-twitter2 bg-twitter2/5 text-twitter2" : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50"
                        )}
                    >
                        <input {...getThumbnailInputProps()} />
                        {thumbnailPreview ? (
                            <>
                                <img src={thumbnailPreview} alt="Thumbnail preview" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <p className="text-xs text-white font-medium">Change</p>
                                </div>
                            </>
                        ) : (
                            <>
                                <ImageIcon className={cn("w-6 h-6 mb-2 transition-colors", isThumbnailDragActive ? "text-lantern" : "text-zinc-500 group-hover:text-zinc-300")} />
                                <span className={cn("text-xs transition-colors", isThumbnailDragActive ? "text-lantern" : "text-zinc-400 group-hover:text-zinc-300")}>
                                    {isThumbnailUploading ? "Uploading..." : "Upload file"}
                                </span>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Playlists */}
            <div className="space-y-2">
                <Label className="text-sm font-medium text-zinc-300">Playlists</Label>
                <PlaylistSelector
                    selectedPlaylists={selectedPlaylists}
                    onSelect={setSelectedPlaylists}
                />
            </div>

            {/* Who can see this video */}
            <div className="space-y-3">
                <Label className="text-sm font-medium text-zinc-300">Who can see this video</Label>
                <p className="text-xs text-zinc-500">Control who can view your video</p>
                <GooDropdown
                    align="start"
                    width={260}
                    gap={8}
                    itemHeight={52}
                    headerHeight={44}
                    header={
                        <div className="flex h-full flex-col justify-center border-b border-zinc-800 px-3">
                            <h3 className="font-medium text-white text-sm">Choose audience</h3>
                        </div>
                    }
                    triggerClassName="flex items-center gap-3 h-12 px-4 rounded-full border border-zinc-700 text-md font-medium text-white hover:bg-white/5 transition-colors w-fit"
                    trigger={
                        <>
                            {videoAudience === "everyone" && <><Globe className="w-5 h-5 text-bleu" />Everyone</>}
                            {videoAudience === "followers" && <><Users className="w-5 h-5 text-green-400" />Followers</>}
                            {videoAudience === "verified" && <><BadgeCheck className="w-5 h-5 text-bleu" />Verified</>}
                            {videoAudience === "token_holders" && <><Medal className="w-5 h-5 text-yellow-400" />Coin Holders</>}
                            <ChevronDown className="w-5 h-5 ml-1 opacity-50" />
                        </>
                    }
                    items={([
                        { value: "everyone", label: "Everyone", icon: <Globe className="w-4 h-4" />, color: "text-bleu", bg: "bg-bleu/10" },
                        { value: "followers", label: "Followers", icon: <Users className="w-4 h-4" />, color: "text-green-400", bg: "bg-green-500/10" },
                        { value: "verified", label: "Verified", icon: <BadgeCheck className="w-4 h-4" />, color: "text-bleu", bg: "bg-bleu/10" },
                        { value: "token_holders", label: "Coin Holders", icon: <Medal className="w-4 h-4" />, color: "text-yellow-400", bg: "bg-yellow-500/10" },
                    ] as const).map((opt) => ({
                        key: opt.value,
                        onClick: () => setVideoAudience(opt.value),
                        className: "justify-between px-2.5 cursor-pointer hover:bg-white/5",
                        label: (
                            <>
                                <span className="flex items-center gap-2.5">
                                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", opt.bg, opt.color)}>{opt.icon}</span>
                                    <span className="font-medium text-white text-sm">{opt.label}</span>
                                </span>
                                {videoAudience === opt.value && <Check className="w-4 h-4 text-bleu" />}
                            </>
                        ),
                    }))}
                />
            </div>

            {/* Show More Section */}
            <ShowMoreSection
                autoChapters={autoChapters}
                setAutoChapters={setAutoChapters}
                autoPlaces={autoPlaces}
                setAutoPlaces={setAutoPlaces}
                remixing={remixing}
                setRemixing={setRemixing}
                comments={comments}
                setComments={setComments}
                commentModeration={commentModeration}
                setCommentModeration={setCommentModeration}
                commentSort={commentSort}
                setCommentSort={setCommentSort}
                showLikeCount={showLikeCount}
                setShowLikeCount={setShowLikeCount}
                captionCertification={captionCertification}
                setCaptionCertification={setCaptionCertification}
                recordingDate={recordingDate}
                setRecordingDate={setRecordingDate}
                videoLocation={videoLocation}
                setVideoLocation={setVideoLocation}
                license={license}
                setLicense={setLicense}
                allowEmbedding={allowEmbedding}
                setAllowEmbedding={setAllowEmbedding}
                publishToFeed={publishToFeed}
                setPublishToFeed={setPublishToFeed}
                category={category}
                setCategory={setCategory}
                languages={languages}
                onLanguagesChange={onLanguagesChange}
                collaborators={collaborators}
                onCollaboratorsChange={onCollaboratorsChange}
                whoCanComment={whoCanComment}
                setWhoCanComment={setWhoCanComment}
                allowedCommenters={allowedCommenters}
                onAllowedCommentersChange={onAllowedCommentersChange}
            />
        </div>
    )
}
