"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Image as ImageIcon, Copy, Coins, Maximize2, Settings, ChevronDown, ChevronUp, Sparkles, Globe, Users, BadgeCheck, Medal, X, Search, Check, CalendarIcon } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { toast } from "sonner"
import { motion, AnimatePresence } from "framer-motion"
import { TickerEditDialog } from "./ticker-edit-dialog"
import { TokenLaunchState, TokenLaunchTrigger } from "./token-launch-section"
import { useTokenLaunch } from "@/hooks/use-token-launch"
import { PlaylistSelector } from "./playlist-selector"
import { useDropzone } from "react-dropzone"
import { AnimatedSlider } from "@/components/ui/motion-slider"
import { Switch } from "@/components/ui/switch"

import { trpc } from "@/lib/trpc/client"
import { useAuthSession } from "@/hooks/use-auth-session"
import { TextShimmer } from "@/components/ui/text-shimmer"
import { CardsEditor } from "@/components/video/cards"
import type { DraftCard } from "@/components/video/cards"

// All languages supported by Deepgram Nova-3
const CAPTION_LANGS = [
    { code: "ar", name: "Arabic" },
    { code: "bn", name: "Bengali" },
    { code: "bg", name: "Bulgarian" },
    { code: "ca", name: "Catalan" },
    { code: "zh", name: "Chinese (Simplified)" },
    { code: "zh-TW", name: "Chinese (Traditional)" },
    { code: "hr", name: "Croatian" },
    { code: "cs", name: "Czech" },
    { code: "da", name: "Danish" },
    { code: "nl", name: "Dutch" },
    { code: "en", name: "English" },
    { code: "et", name: "Estonian" },
    { code: "fi", name: "Finnish" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "el", name: "Greek" },
    { code: "he", name: "Hebrew" },
    { code: "hi", name: "Hindi" },
    { code: "hu", name: "Hungarian" },
    { code: "id", name: "Indonesian" },
    { code: "it", name: "Italian" },
    { code: "ja", name: "Japanese" },
    { code: "ko", name: "Korean" },
    { code: "lv", name: "Latvian" },
    { code: "lt", name: "Lithuanian" },
    { code: "ms", name: "Malay" },
    { code: "no", name: "Norwegian" },
    { code: "pl", name: "Polish" },
    { code: "pt", name: "Portuguese" },
    { code: "pt-BR", name: "Portuguese (Brazil)" },
    { code: "ro", name: "Romanian" },
    { code: "ru", name: "Russian" },
    { code: "sk", name: "Slovak" },
    { code: "es", name: "Spanish" },
    { code: "sv", name: "Swedish" },
    { code: "ta", name: "Tamil" },
    { code: "te", name: "Telugu" },
    { code: "th", name: "Thai" },
    { code: "tr", name: "Turkish" },
    { code: "uk", name: "Ukrainian" },
    { code: "vi", name: "Vietnamese" },
];

interface VideoDetailsStepProps {
    file: File
    uploadedUrl: string | null
    isUploading: boolean
    uploadProgress?: number
    onBack: () => void
    onNext: () => void
}

export function VideoDetailsStep({ file, uploadedUrl, isUploading, uploadProgress = 0, onBack, onNext }: VideoDetailsStepProps) {
    const [showMore, setShowMore] = React.useState(false)
    const [title, setTitle] = React.useState(file.name.replace(/\.[^/.]+$/, ""))
    const [description, setDescription] = React.useState("")
    const [isEditingTicker, setIsEditingTicker] = React.useState(false)
    const [currentStep, setCurrentStep] = React.useState<"details" | "video-elements" | "checks" | "visibility">("details")

    const [visibility, setVisibility] = React.useState("public")
    const [selectedPlaylists, setSelectedPlaylists] = React.useState<string[]>([])

    // Token Launch State
    const [tokenLaunch, setTokenLaunch] = React.useState<TokenLaunchState>({
        earningsEnabled: true,
        ticker: "",
        creatorFee: 5,
        splits: [],
        buyAmount: undefined,
        isTickerManuallyEdited: false
    })

    const { launchToken, isLaunching: isTokenLaunching } = useTokenLaunch()

    const createVideoMutation = trpc.content.createVideo.useMutation()
    const createCardMutation = trpc.cards.create.useMutation()
    const transcribeVideoMutation = trpc.upload.transcribeVideo.useMutation({
        onError: (err) => {
            console.error("Caption generation failed:", err)
            toast.error(`Caption generation failed: ${err.message}`)
        },
    })
    const { data: session } = useAuthSession()

    // Advanced Settings State
    const [autoChapters, setAutoChapters] = React.useState(true)
    const [autoPlaces, setAutoPlaces] = React.useState(true)
    const [remixing, setRemixing] = React.useState("video-audio")
    const [comments, setComments] = React.useState("on")
    const [commentModeration, setCommentModeration] = React.useState("basic")
    const [commentSort, setCommentSort] = React.useState("top")
    const [showLikeCount, setShowLikeCount] = React.useState(true)
    const [captionCertification, setCaptionCertification] = React.useState("none")
    const [recordingDate, setRecordingDate] = React.useState<Date | undefined>()
    const [videoLocation, setVideoLocation] = React.useState("")
    const [license, setLicense] = React.useState("standard")
    const [allowEmbedding, setAllowEmbedding] = React.useState(true)
    const [publishToFeed, setPublishToFeed] = React.useState(true)

    // New enhanced fields
    const [videoAudience, setVideoAudience] = React.useState<"everyone" | "followers" | "verified" | "token_holders">("everyone")
    const [whoCanComment, setWhoCanComment] = React.useState<"everyone" | "followers" | "verified" | "none">("everyone")
    const [allowedCommenters, setAllowedCommenters] = React.useState<{ id: string; name: string; avatar_url?: string }[]>([])
    const [commenterSearch, setCommenterSearch] = React.useState("")
    const [commenterSearchOpen, setCommenterSearchOpen] = React.useState(false)
    const [category, setCategory] = React.useState<string>("")
    const [languages, setLanguages] = React.useState<string[]>([])
    const [langPickerOpen, setLangPickerOpen] = React.useState(false)
    const [langSearch, setLangSearch] = React.useState("")
    const [collaborators, setCollaborators] = React.useState<{ id: string; name: string; username?: string; avatar_url?: string }[]>([])
    const [collaboratorSearch, setCollaboratorSearch] = React.useState("")
    const [collaboratorSearchOpen, setCollaboratorSearchOpen] = React.useState(false)

    const [cardsEditorOpen, setCardsEditorOpen] = React.useState(false)
    const [pendingCards, setPendingCards] = React.useState<DraftCard[]>([])

    const collaboratorSearchQuery = trpc.content.searchCollaborators.useQuery(
        { query: collaboratorSearch, limit: 6 },
        { enabled: collaboratorSearch.length >= 2 }
    )
    const commenterSearchQuery = trpc.user.search.useQuery(
        { query: commenterSearch, limit: 6 },
        { enabled: commenterSearch.length >= 2 }
    )

    // Auto-generate ticker from title
    React.useEffect(() => {
        if (!tokenLaunch.isTickerManuallyEdited && title) {
            // Take first 3-5 chars of title, uppercase, remove non-alphanumeric
            const autoTicker = title
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, 15)

            setTokenLaunch(prev => ({ ...prev, ticker: autoTicker }))
        }
    }, [title, tokenLaunch.isTickerManuallyEdited])
    const videoUrl = React.useMemo(() => URL.createObjectURL(file), [file])

    // Thumbnail State
    const [thumbnailFile, setThumbnailFile] = React.useState<File | null>(null)
    const [thumbnailPreview, setThumbnailPreview] = React.useState<string | null>(null)
    const [thumbnailUrl, setThumbnailUrl] = React.useState<string | undefined>(undefined)
    const [isThumbnailUploading, setIsThumbnailUploading] = React.useState(false)

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation()
    const previewVideoRef = React.useRef<HTMLVideoElement>(null)
    const autoThumbAttempted = React.useRef(false)

    const captureAndUpload = React.useCallback(async (vid: HTMLVideoElement | null) => {
        if (!vid) return
        if (autoThumbAttempted.current) return
        if (thumbnailFile) return
        if (vid.readyState < 2) return
        autoThumbAttempted.current = true
        const canvas = document.createElement('canvas')
        canvas.width = vid.videoWidth || 1280
        canvas.height = vid.videoHeight || 720
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(async (blob) => {
            if (!blob) {
                autoThumbAttempted.current = false
                return
            }
            const autoFile = new File([blob], `thumb_${Date.now()}.jpg`, { type: 'image/jpeg' })
            setThumbnailFile(autoFile)
            setThumbnailPreview(URL.createObjectURL(autoFile))
            setIsThumbnailUploading(true)
            try {
                const { token, path } = await getPresignedUrl.mutateAsync({
                    bucket: 'thumbnails',
                    filename: autoFile.name,
                    contentType: 'image/jpeg',
                })
                const { supabase } = await import('@/lib/supabase/client')
                const { data, error } = await supabase.storage.from('thumbnails').uploadToSignedUrl(path, token, autoFile)
                if (error) throw error
                const { data: pub } = supabase.storage.from('thumbnails').getPublicUrl(data!.path)
                setThumbnailUrl(pub.publicUrl)
            } catch (e) {
                console.error('Auto-thumbnail upload failed', e)
            } finally {
                setIsThumbnailUploading(false)
            }
        }, 'image/jpeg', 0.88)
    }, [getPresignedUrl, thumbnailFile])

    const onThumbnailDrop = React.useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const file = acceptedFiles[0]
            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                toast.error("Image too large. Max size is 5MB.")
                return
            }

            setThumbnailFile(file)
            setThumbnailPreview(URL.createObjectURL(file))
            setIsThumbnailUploading(true)

            try {
                // 1. Get Presigned URL
                const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                const { token, path } = await getPresignedUrl.mutateAsync({
                    bucket: 'thumbnails',
                    filename: sanitizedFileName,
                    contentType: file.type
                });

                // 2. Upload
                const { supabase } = await import('@/lib/supabase/client')
                const { data, error } = await supabase.storage
                    .from('thumbnails')
                    .uploadToSignedUrl(path, token, file)

                if (error) throw error

                const { data: publicUrlData } = supabase.storage.from('thumbnails').getPublicUrl(data!.path)
                setThumbnailUrl(publicUrlData.publicUrl)
                toast.success("Thumbnail uploaded")
            } catch (error) {
                console.error(error)
                toast.error("Failed to upload thumbnail")
            } finally {
                setIsThumbnailUploading(false)
            }
        }
    }, [getPresignedUrl])

    const { getRootProps: getThumbnailRootProps, getInputProps: getThumbnailInputProps, isDragActive: isThumbnailDragActive } = useDropzone({
        onDrop: onThumbnailDrop,
        accept: {
            'image/jpeg': [],
            'image/png': [],
            'image/webp': []
        },
        maxFiles: 1,
        multiple: false
    })

    // Generate a preview ID for the UI
    // We use a memoized ID that persists for this session. 
    // This ID will be sent to the server to ensure the link matches.
    const previewId = React.useMemo(() => {
        // Simple nanoid-like generator
        return Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12)
    }, [])

    // We can assume the host is watchparty.xyz for the prompt, or use window.location if we want to be truly dynamic, 
    // but the user specific "watchparty.xyz" in the prompt before. 
    // However, for local dev, it should probably be localhost.
    // Let's use a dynamic origin if possible, or relative path.
    // User asked "should i buy a domain...".
    // I will use `window.location.origin` if mounted, else placeholder.
    const [origin, setOrigin] = React.useState("https://watchparty.xyz")
    React.useEffect(() => {
        if (typeof window !== "undefined") {
            setOrigin(window.location.origin)
        }
    }, [])

    const previewLink = `${origin}/${session?.user?.username || "user"}/${previewId}`

    const copyLink = () => {
        navigator.clipboard.writeText(previewLink)
        toast.success("Link copied to clipboard")
    }

    // Determine if we should show the preview column
    // It should be visible on 'details' and 'visibility' steps
    const showPreview = currentStep === "details" || currentStep === "visibility"

    const handleNext = async () => {
        if (currentStep === "details") {
            setCurrentStep("video-elements")
        } else if (currentStep === "video-elements") {
            setCurrentStep("checks")
        } else if (currentStep === "checks") {
            setCurrentStep("visibility")
        } else {
            // Save logic
            if (isUploading && !uploadedUrl) {
                toast.error("Please wait for video to finish uploading")
                return
            }

            if (!uploadedUrl) {
                toast.error("No video file uploaded")
                return
            }

            try {
                let tokenData = {
                    tokenAddress: undefined as string | undefined,
                    poolAddress: undefined as string | undefined,
                    tokenStatus: undefined as "draft" | "live" | undefined
                }

                if (tokenLaunch.earningsEnabled) {
                    if (!tokenLaunch.ticker) {
                        toast.error("Ticker symbol is required for earnings")
                        return
                    }

                    const isLiveLaunch = tokenLaunch.buyAmount && tokenLaunch.buyAmount > 0

                    if (isLiveLaunch) {
                        // On-chain launch: upload metadata + execute Solana transactions
                        let primaryImageUrl = thumbnailUrl || "";

                        const tokenName = title.slice(0, 32) || "Video Token";
                        const metadataBlob = new Blob([JSON.stringify({
                            name: tokenName,
                            symbol: tokenLaunch.ticker,
                            description: description || title,
                            image: primaryImageUrl
                        })], { type: 'application/json' });
                        const metadataFile = new File([metadataBlob], 'metadata.json', { type: 'application/json' });

                        const { token, path } = await getPresignedUrl.mutateAsync({
                            bucket: 'thumbnails',
                            filename: `metadata_${Date.now()}.json`,
                            contentType: 'application/json'
                        });

                        const { supabase } = await import('@/lib/supabase/client')
                        const { data: metaDataRaw, error: metaError } = await supabase.storage
                            .from('thumbnails')
                            .uploadToSignedUrl(path, token, metadataFile)

                        if (metaError) throw metaError;

                        const { data: metadataPublicData } = supabase.storage.from('thumbnails').getPublicUrl(metaDataRaw!.path);

                        const launchResult = await launchToken(
                            { name: tokenName, symbol: tokenLaunch.ticker, image: metadataPublicData.publicUrl, description },
                            tokenLaunch
                        )

                        if (!launchResult.success) {
                            return
                        }

                        tokenData.tokenStatus = (launchResult.status as "draft" | "live") ?? "live"
                        tokenData.tokenAddress = launchResult.tokenAddress
                        tokenData.poolAddress = launchResult.poolAddress
                    } else {
                        // Draft mode: no on-chain transaction needed, server handles DB insert
                        tokenData.tokenStatus = "draft"
                    }
                }

                const { videoId } = await createVideoMutation.mutateAsync({
                    title,
                    description,
                    videoUrl: uploadedUrl,
                    thumbnailUrl: thumbnailUrl,
                    visibility: visibility as "public" | "private" | "unlisted",
                    duration: 0,
                    playlistIds: selectedPlaylists,
                    id: previewId,
                    // Token Launch Data
                    earningsEnabled: tokenLaunch.earningsEnabled,
                    ticker: tokenLaunch.earningsEnabled ? tokenLaunch.ticker : undefined,
                    creatorFeePercent: tokenLaunch.earningsEnabled ? tokenLaunch.creatorFee : undefined,
                    tokenAddress: tokenData.tokenAddress,
                    poolAddress: tokenData.poolAddress,
                    tokenStatus: tokenData.tokenStatus,
                    splits: tokenLaunch.earningsEnabled && tokenLaunch.splits.length > 0
                        ? tokenLaunch.splits
                        : undefined,
                    // New fields
                    audience: videoAudience,
                    whoCanComment,
                    allowedCommenters: allowedCommenters.length > 0 ? allowedCommenters : undefined,
                    category: category || undefined,
                    language: languages,
                    recordingDate: recordingDate,
                    videoLocation: videoLocation || undefined,
                    collaborators: collaborators.length > 0 ? collaborators : undefined,
                })
                // Fire-and-forget — one transcription job per selected language.
                // Captions appear in the player once each Deepgram job completes.
                const langsToTranscribe = languages.length > 0 ? languages : [null];
                for (const lang of langsToTranscribe) {
                    transcribeVideoMutation.mutate({
                        postId: videoId,
                        videoUrl: uploadedUrl!,
                        language: lang,
                    });
                }

                // Batch-create any cards staged in the draft editor
                if (pendingCards.length > 0) {
                    await Promise.all(pendingCards.map((c, i) =>
                        createCardMutation.mutateAsync({
                            postId: videoId,
                            type: c.type,
                            title: c.title || undefined,
                            message: c.message || undefined,
                            url: c.url || undefined,
                            startTime: c.startTime,
                            duration: c.duration,
                            sortOrder: i,
                        })
                    ))
                }

                onNext()
                toast.success("Video saved and published!")
            } catch (error) {
                toast.error("Failed to save video details")
                console.error(error)
            }
        }
    }

    const handleBack = () => {
        if (currentStep === "video-elements") {
            setCurrentStep("details")
        } else if (currentStep === "checks") {
            setCurrentStep("video-elements")
        } else if (currentStep === "visibility") {
            setCurrentStep("checks")
        } else {
            onBack()
        }
    }



    return (
        <div className="relative flex flex-col h-[calc(100vh-125px)] max-h-[700px]">
            {/* Stepper */}
            <div className="flex flex-col gap-4 items-center justify-between px-12 py-4 border-b border-zinc-800">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-white">{title || "Video Details"}</h2>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setCurrentStep("details")} className="flex items-center">
                        <span className={cn("text-sm font-medium transition-colors", currentStep === "details" ? "text-white" : "text-zinc-500")}>Details</span>
                    </button>
                    <span className="w-12 h-[1px] bg-zinc-700 mx-2 relative">
                        {/* Progress bar logic could go here */}
                    </span>

                    <button onClick={() => currentStep !== "details" && setCurrentStep("video-elements")} className="flex items-center" disabled={currentStep === "details"}>
                        <span className={cn("text-sm font-medium transition-colors", currentStep === "video-elements" ? "text-white" : "text-zinc-500")}>Video elements</span>
                    </button>
                    <span className="w-12 h-[1px] bg-zinc-700 mx-2" />

                    <button onClick={() => (currentStep === "checks" || currentStep === "visibility") && setCurrentStep("checks")} className="flex items-center" disabled={currentStep === "details" || currentStep === "video-elements"}>
                        <span className={cn("text-sm font-medium transition-colors", currentStep === "checks" ? "text-white" : "text-zinc-500")}>Checks</span>
                    </button>
                    <span className="w-12 h-[1px] bg-zinc-700 mx-2" />

                    <span className={cn("text-sm font-medium transition-colors", currentStep === "visibility" ? "text-white" : "text-zinc-500")}>Visibility</span>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
                {/* Main Content Area */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                    {currentStep === "details" && (
                        <div className="space-y-8 max-w-2xl mx-auto">
                            {/* Title */}
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <Label className="text-sm font-medium text-zinc-300">Title (required)</Label>
                                    <span className="text-xs text-zinc-500">{title.length}/100</span>
                                </div>
                                <div className="relative group">
                                    <Input
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="bg-transparent h-10 border-zinc-700 focus:border-lantern/50 transition-colors pr-10"
                                        maxLength={100}
                                    />
                                </div>
                            </div>

                            {/* Description */}
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <Label className="text-sm font-medium text-zinc-300">Description</Label>
                                    <span className="text-xs text-zinc-500">{description.length}/5000</span>
                                </div>
                                <Textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Tell viewers about your video (type @ to mention a channel)"
                                    className="bg-transparent rounded-2xl border-zinc-700 focus:border-lantern/50 min-h-[120px] resize-none"
                                    maxLength={5000}
                                />
                            </div>

                            {/* Thumbnail */}
                            <div className="space-y-4">
                                <Label className="text-sm font-medium text-zinc-300">Thumbnail</Label>
                                <p className="text-xs text-zinc-500">Set a thumbnail that stands out and draws viewers' attention. Image will also be used as token image</p>
                                <div className="grid grid-cols-3 gap-4">
                                    <div
                                        {...getThumbnailRootProps()}
                                        className={cn(
                                            "flex flex-col items-center justify-center aspect-video border border-dashed rounded-xl transition-colors group cursor-pointer overflow-hidden relative",
                                            isThumbnailDragActive ? "border-lantern bg-lantern/5 text-lantern" : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800/50"
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
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <button className="flex items-center gap-2 h-10 px-4 rounded-full border border-zinc-700 text-sm font-medium text-white hover:bg-white/5 transition-colors outline-none w-fit">
                                            {videoAudience === "everyone" && <><Globe className="w-4 h-4 text-blue-400" />Everyone</>}
                                            {videoAudience === "followers" && <><Users className="w-4 h-4 text-green-400" />Followers</>}
                                            {videoAudience === "verified" && <><BadgeCheck className="w-4 h-4 text-blue-400" />Verified</>}
                                            {videoAudience === "token_holders" && <><Medal className="w-4 h-4 text-yellow-400" />Token Holders</>}
                                            <ChevronDown className="w-4 h-4 ml-1 opacity-50" />
                                        </button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-[260px] bg-zinc-900 border-zinc-800 rounded-xl p-0 overflow-hidden shadow-2xl">
                                        <div className="p-3 border-b border-zinc-800">
                                            <h3 className="font-bold text-white text-sm">Choose audience</h3>
                                        </div>
                                        <div className="p-1">
                                            {([
                                                { value: "everyone", label: "Everyone", icon: <Globe className="w-4 h-4" />, color: "text-blue-400", bg: "bg-blue-500/10" },
                                                { value: "followers", label: "Followers", icon: <Users className="w-4 h-4" />, color: "text-green-400", bg: "bg-green-500/10" },
                                                { value: "verified", label: "Verified", icon: <BadgeCheck className="w-4 h-4" />, color: "text-blue-400", bg: "bg-blue-500/10" },
                                                { value: "token_holders", label: "Token Holders", icon: <Medal className="w-4 h-4" />, color: "text-yellow-400", bg: "bg-yellow-500/10" },
                                            ] as const).map(opt => (
                                                <DropdownMenuItem
                                                    key={opt.value}
                                                    onClick={() => setVideoAudience(opt.value)}
                                                    className="flex items-center justify-between p-2.5 cursor-pointer hover:bg-white/5 rounded-lg focus:bg-white/5"
                                                >
                                                    <div className="flex items-center gap-2.5">
                                                        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", opt.bg, opt.color)}>{opt.icon}</div>
                                                        <span className="font-medium text-white text-sm">{opt.label}</span>
                                                    </div>
                                                    {videoAudience === opt.value && <Check className="w-4 h-4 text-blue-400" />}
                                                </DropdownMenuItem>
                                            ))}
                                        </div>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            {/* Show More Section */}
                            <div className="pt-4">
                                <button
                                    onClick={() => setShowMore(!showMore)}
                                    className="flex items-center gap-1 text-sm font-medium text-zinc-400 hover:text-white transition-colors"
                                >
                                    {showMore ? "Show less" : "Show more"}
                                    {showMore ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
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
                                                        <Checkbox id="paid" className="mt-1 border-zinc-600 data-[state=checked]:bg-lantern data-[state=checked]:border-white/50" />
                                                        <div className="grid gap-1.5 leading-none">
                                                            <Label htmlFor="paid" className="text-sm font-normal text-zinc-300 leading-snug">
                                                                My video contains paid promotion like a product placement, sponsorship, or endorsement
                                                            </Label>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Collaboration */}
                                                <div className="space-y-3">
                                                    <h3 className="text-sm font-medium text-zinc-300">Collaboration</h3>
                                                    <p className="text-xs text-zinc-500">
                                                        Grow your audience by collaborating with other creators and expand your video's reach to their audiences.
                                                    </p>
                                                    <div className="relative">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                                                        <input
                                                            value={collaboratorSearch}
                                                            onChange={e => { setCollaboratorSearch(e.target.value); setCollaboratorSearchOpen(true) }}
                                                            onFocus={() => setCollaboratorSearchOpen(true)}
                                                            placeholder="Search creators to invite..."
                                                            className="w-full h-9 pl-8 pr-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
                                                        />
                                                        {collaboratorSearchOpen && collaboratorSearch.length >= 2 && (
                                                            <div className="absolute top-10 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden z-50">
                                                                {collaboratorSearchQuery.data?.users.map(u => (
                                                                    <button
                                                                        key={u.id}
                                                                        onClick={() => {
                                                                            if (!collaborators.find(c => c.id === u.id)) {
                                                                                setCollaborators(prev => [...prev, { id: u.id, name: u.name || "", username: u.username || undefined, avatar_url: u.avatar_url || undefined }])
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
                                                                    <button onClick={() => setCollaborators(prev => prev.filter(co => co.id !== c.id))} className="text-zinc-500 hover:text-white">
                                                                        <X className="w-3 h-3" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

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
                                                            className="mt-1 border-zinc-600 data-[state=checked]:bg-lantern data-[state=checked]:border-white/50"
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
                                                        Help viewers explore key places in your video. These are public places like restaurants and shops – we don’t display your current location or other private info. <a href="#" className="text-blue-500 hover:underline">Learn more</a>
                                                    </p>
                                                    <div className="flex items-start space-x-2">
                                                        <Checkbox
                                                            id="autoPlaces"
                                                            checked={autoPlaces}
                                                            onCheckedChange={(c) => setAutoPlaces(c as boolean)}
                                                            className="mt-1 border-zinc-600 data-[state=checked]:bg-lantern data-[state=checked]:border-white/50"
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
                                                    <Input placeholder="Add tag" className="h-10 bg-transparent border-zinc-700 focus:border-lantern/50" />
                                                    <p className="text-xs text-zinc-600 text-right">0/500</p>
                                                </div>

                                                {/* Language and Captions */}
                                                <div className="space-y-3">
                                                    <h3 className="text-sm font-medium text-zinc-300">Language and captions</h3>
                                                    <p className="text-xs text-zinc-500">Captions will be auto-generated via Deepgram for each selected language</p>
                                                    {languages.length > 0 && (
                                                        <div className="flex flex-wrap gap-2">
                                                            {languages.map(code => {
                                                                const entry = CAPTION_LANGS.find(l => l.code === code)
                                                                return (
                                                                    <div key={code} className="flex items-center gap-1 bg-zinc-800 rounded-full px-3 py-1">
                                                                        <span className="text-xs text-zinc-200">{entry?.name ?? code.toUpperCase()}</span>
                                                                        <button onClick={() => setLanguages(prev => prev.filter(l => l !== code))} className="text-zinc-500 hover:text-white ml-1">
                                                                            <X className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                )
                                                            })}
                                                        </div>
                                                    )}
                                                    <div className="relative">
                                                        <button
                                                            onClick={() => { setLangPickerOpen(!langPickerOpen); setLangSearch("") }}
                                                            className="flex items-center gap-2 h-9 px-3 rounded-lg border border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
                                                        >
                                                            <span>+ Add language</span>
                                                            <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", langPickerOpen && "rotate-180")} />
                                                        </button>
                                                        {langPickerOpen && (
                                                            <div className="absolute top-10 left-0 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl z-50 w-56 flex flex-col" style={{ maxHeight: 280 }}>
                                                                <div className="p-2 border-b border-zinc-700/60">
                                                                    <div className="flex items-center gap-2 bg-zinc-800 rounded-lg px-2.5 py-1.5">
                                                                        <Search className="w-3.5 h-3.5 text-zinc-500 flex-none" />
                                                                        <input
                                                                            autoFocus
                                                                            value={langSearch}
                                                                            onChange={e => setLangSearch(e.target.value)}
                                                                            placeholder="Search language..."
                                                                            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 outline-none"
                                                                        />
                                                                    </div>
                                                                </div>
                                                                <div className="overflow-y-auto custom-scrollbar">
                                                                    {CAPTION_LANGS.filter(l =>
                                                                        l.name.toLowerCase().includes(langSearch.toLowerCase()) ||
                                                                        l.code.toLowerCase().includes(langSearch.toLowerCase())
                                                                    ).map(lang => (
                                                                        <button
                                                                            key={lang.code}
                                                                            onClick={() => {
                                                                                setLanguages(prev =>
                                                                                    prev.includes(lang.code)
                                                                                        ? prev.filter(c => c !== lang.code)
                                                                                        : [...prev, lang.code]
                                                                                )
                                                                            }}
                                                                            className={cn(
                                                                                "flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-white/5 transition-colors",
                                                                                languages.includes(lang.code) ? "text-lantern" : "text-zinc-200"
                                                                            )}
                                                                        >
                                                                            <span>{lang.name}</span>
                                                                            {languages.includes(lang.code) && <Check className="w-3.5 h-3.5 flex-none" />}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* License */}
                                                <div className="space-y-3">
                                                    <h3 className="text-sm font-medium text-zinc-300">License</h3>
                                                    <p className="text-xs text-zinc-500">Learn about <a href="#" className="text-blue-500 hover:underline">license types</a>.</p>

                                                    <div className="space-y-4">
                                                        <Select value={license} onValueChange={setLicense}>
                                                            <SelectTrigger className="w-full h-10 bg-transparent border-zinc-700 text-zinc-300">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                                                                <SelectItem value="standard">Standard Watchparty License</SelectItem>
                                                                <SelectItem value="cc">Creative Commons - Attribution</SelectItem>
                                                            </SelectContent>
                                                        </Select>

                                                        <div className="flex items-start space-x-2">
                                                            <Checkbox
                                                                id="embedding"
                                                                checked={allowEmbedding}
                                                                onCheckedChange={(c) => setAllowEmbedding(c as boolean)}
                                                                className="mt-1 border-zinc-600 data-[state=checked]:bg-lantern data-[state=checked]:border-white/50"
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
                                                                className="mt-1 border-zinc-600 data-[state=checked]:bg-lantern data-[state=checked]:border-white/50"
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
                                                                            "w-full h-10 justify-start text-left font-normal bg-transparent border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors",
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
                                                                className="h-10 bg-transparent border-zinc-700 text-zinc-300 focus:border-lantern/50"
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
                                                    <Select value={category || ""} onValueChange={setCategory}>
                                                        <SelectTrigger className="w-full h-10 bg-transparent border-zinc-700 text-zinc-300">
                                                            <SelectValue placeholder="Select a category" />
                                                        </SelectTrigger>
                                                        <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300 max-h-[240px]">
                                                            <SelectItem value="Just Chatting">Just Chatting</SelectItem>
                                                            <SelectItem value="Music">Music</SelectItem>
                                                            <SelectItem value="Gaming">Gaming</SelectItem>
                                                            <SelectItem value="Games">Games</SelectItem>
                                                            <SelectItem value="Esports">Esports</SelectItem>
                                                            <SelectItem value="Tech">Tech</SelectItem>
                                                            <SelectItem value="Creative">Creative</SelectItem>
                                                            <SelectItem value="Sports">Sports</SelectItem>
                                                            <SelectItem value="IRL">IRL</SelectItem>
                                                            <SelectItem value="Live">Live</SelectItem>
                                                            <SelectItem value="News">News</SelectItem>
                                                            <SelectItem value="Memes">Memes</SelectItem>
                                                            <SelectItem value="Political">Political</SelectItem>
                                                            <SelectItem value="GTAV">GTAV</SelectItem>
                                                            <SelectItem value="Fortnite">Fortnite</SelectItem>
                                                            <SelectItem value="Pranks">Pranks</SelectItem>
                                                            <SelectItem value="Trending">Trending</SelectItem>
                                                            <SelectItem value="Travel">Travel</SelectItem>
                                                            <SelectItem value="Food">Food & Cooking</SelectItem>
                                                            <SelectItem value="Education">Education</SelectItem>
                                                            <SelectItem value="Fitness">Fitness</SelectItem>
                                                            <SelectItem value="People">People & Blogs</SelectItem>
                                                        </SelectContent>
                                                    </Select>
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
                                                            <Select value={comments} onValueChange={setComments}>
                                                                <SelectTrigger className="w-full h-10 bg-transparent border-zinc-700 text-zinc-300">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                                                                    <SelectItem value="on">On</SelectItem>
                                                                    <SelectItem value="off">Off</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label className="text-xs text-zinc-500">Moderation</Label>
                                                            <Select value={commentModeration} onValueChange={setCommentModeration} disabled={comments === "off"}>
                                                                <SelectTrigger className="w-full h-10 bg-transparent border-zinc-700 text-zinc-300">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                                                                    <SelectItem value="basic">Basic</SelectItem>
                                                                    <SelectItem value="strict">Strict</SelectItem>
                                                                    <SelectItem value="hold">Hold all</SelectItem>
                                                                    <SelectItem value="none">None</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>

                                                    {/* Who can comment */}
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
                                                                    onClick={() => setWhoCanComment(opt.value)}
                                                                    className={cn(
                                                                        "px-3 py-1.5 rounded-full text-xs font-medium border transition-all disabled:opacity-40",
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
                                                                                            setAllowedCommenters(prev => [...prev, { id: u.id, name: u.name || u.email || "", avatar_url: u.avatar_url || undefined }])
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
                                                                                <button onClick={() => setAllowedCommenters(prev => prev.filter(c => c.id !== u.id))} className="text-zinc-500 hover:text-white">
                                                                                    <X className="w-3 h-3" />
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="pt-2 flex flex-col gap-4">
                                                        <div className="w-[calc(50%-8px)] space-y-1">
                                                            <Label className="text-xs text-zinc-500">Sort by</Label>
                                                            <Select value={commentSort} onValueChange={setCommentSort} disabled={comments === "off"}>
                                                                <SelectTrigger className="w-full h-10 bg-transparent border-zinc-700 text-zinc-300">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent className="bg-zinc-900 border-zinc-800 text-zinc-300">
                                                                    <SelectItem value="top">Top</SelectItem>
                                                                    <SelectItem value="newest">Newest</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>

                                                        <div className="flex items-start space-x-2">
                                                            <Checkbox
                                                                id="showLikes"
                                                                checked={showLikeCount}
                                                                onCheckedChange={(c) => setShowLikeCount(c as boolean)}
                                                                className="mt-1 border-zinc-600 data-[state=checked]:bg-lantern data-[state=checked]:border-white/50"
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
                        </div>
                    )}

                    {currentStep === "video-elements" && (
                        <div className="max-w-4xl mx-auto space-y-6">
                            <div className="space-y-1 mb-8">
                                <h3 className="text-xl font-semibold text-white">Video elements</h3>
                                <p className="text-sm text-zinc-400">Use cards and an end screen to show viewers related videos, websites, and calls to action. <a href="#" className="text-blue-500 hover:underline">Learn more</a></p>
                            </div>

                            {/* End Screen */}
                            <div className="flex items-center justify-between p-6 bg-zinc-900/50 rounded-lg group hover:bg-zinc-900 transition-colors">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-zinc-800 rounded-md text-zinc-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-semibold text-white">Add an end screen</h4>
                                        <p className="text-sm text-zinc-500">Promote related content at the end of your video</p>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="ghost" disabled className="text-zinc-500">Import from video</Button>
                                    <Button variant="secondary" className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-full">
                                        Add
                                    </Button>
                                </div>
                            </div>

                            {/* Cards */}
                            <div className="flex items-center justify-between p-6 bg-zinc-900/50 rounded-lg group hover:bg-zinc-900 transition-colors">
                                <div className="flex items-start gap-4">
                                    <div className="p-3 bg-zinc-800 rounded-md text-zinc-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="16" y2="12" /><line x1="12" x2="12.01" y1="8" y2="8" /></svg>
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-semibold text-white">Add cards</h4>
                                        <p className="text-sm text-zinc-500">
                                            Promote related content during your video
                                            {pendingCards.length > 0 && (
                                                <span className="ml-2 text-lantern font-medium">{pendingCards.length} card{pendingCards.length !== 1 ? "s" : ""} added</span>
                                            )}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="secondary"
                                    className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-full"
                                    onClick={() => setCardsEditorOpen(true)}
                                >
                                    {pendingCards.length > 0 ? "Edit" : "Add"}
                                </Button>
                            </div>
                        </div>
                    )}

                    {currentStep === "checks" && (
                        <div className="max-w-4xl mx-auto space-y-8">
                            <div className="space-y-1">
                                <h3 className="text-xl font-semibold text-white">Checks</h3>
                                <p className="text-sm text-zinc-400">We'll check your video for issues that may restrict its visibility and then you will have the opportunity to fix issues before publishing your video. <a href="#" className="text-blue-500 hover:underline">Learn more</a></p>
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h4 className="font-semibold text-white">Copyright</h4>
                                        <div className="flex items-center gap-2">
                                            {/* Green check icon */}
                                            <div className="h-6 w-6 rounded-full border border-green-500 flex items-center justify-center">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-500"><polyline points="20 6 9 17 4 12" /></svg>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-sm text-zinc-500">No issues found</p>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xs text-zinc-500">
                                        Remember: These check results aren't final. Issues may come up in the future that impact your video. <a href="#" className="text-blue-500 hover:underline">Learn more</a>
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentStep === "visibility" && (
                        <div className="space-y-8 max-w-2xl mx-auto">
                            <div className="space-y-1">
                                <h3 className="text-xl font-semibold text-white">Visibility</h3>
                                <p className="text-sm text-zinc-400">Choose when to publish and who can see your video</p>
                            </div>

                            <div className="border border-zinc-800 rounded-lg p-6 space-y-6">
                                <RadioGroup value={visibility} onValueChange={setVisibility} className="space-y-4">
                                    <div className="space-y-4">
                                        <h4 className="font-medium text-white">Save or publish</h4>
                                        <p className="text-xs text-zinc-500">Make your video <b>public, unlisted,</b> or <b>private</b></p>

                                        <div className="space-y-4 pt-2">
                                            <div className="flex items-start space-x-3">
                                                <RadioGroupItem value="private" id="private" className="mt-1 border-zinc-600 text-lantern" />
                                                <div className="space-y-1">
                                                    <Label htmlFor="private" className="text-sm font-medium text-zinc-300">Private</Label>
                                                    <p className="text-xs text-zinc-500">Only you and people you choose can watch your video</p>
                                                </div>
                                            </div>

                                            <div className="flex items-start space-x-3">
                                                <RadioGroupItem value="unlisted" id="unlisted" className="mt-1 border-zinc-600 text-lantern" />
                                                <div className="space-y-1">
                                                    <Label htmlFor="unlisted" className="text-sm font-medium text-zinc-300">Unlisted</Label>
                                                    <p className="text-xs text-zinc-500">Anyone with the video link can watch your video</p>
                                                </div>
                                            </div>

                                            <div className="flex items-start space-x-3">
                                                <RadioGroupItem value="public" id="public" className="mt-1 border-zinc-600 text-lantern" />
                                                <div className="space-y-1">
                                                    <Label htmlFor="public" className="text-sm font-medium text-zinc-300">Public</Label>
                                                    <p className="text-xs text-zinc-500">Everyone can watch your video</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pl-7 pt-2">
                                            <div className="flex items-center space-x-2">
                                                <Checkbox id="premiere" disabled={visibility !== 'public'} className="border-zinc-600 data-[state=checked]:bg-lantern data-[state=checked]:border-lantern disabled:opacity-50" />
                                                <Label htmlFor="premiere" className="text-sm text-zinc-400 font-normal">Set as instant Premiere</Label>
                                            </div>
                                        </div>
                                    </div>
                                </RadioGroup>
                            </div>

                            <div className="border border-zinc-800 rounded-lg p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-900/50 transition-colors">
                                <div className="space-y-1">
                                    <h4 className="font-medium text-white">Schedule</h4>
                                    <p className="text-xs text-zinc-500">Select a date to make your video <b>public</b>.</p>
                                </div>
                                <ChevronDown className="w-5 h-5 text-zinc-500" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column - Preview (Visible on details AND visibility steps) */}
                {showPreview && (
                    <div className="hidden lg:flex w-[300px] bg-zinc-900/30 border-l border-zinc-800 p-6 flex-col gap-6">
                        <div className="aspect-video bg-black rounded-lg overflow-hidden relative group">
                            {file.type.startsWith('video/') ? (
                                <video
                                    ref={previewVideoRef}
                                    src={videoUrl}
                                    className="w-full h-full object-cover"
                                    controls
                                    onLoadedMetadata={(e) => {
                                        const vid = e.currentTarget
                                        const seekTo = isFinite(vid.duration) && vid.duration > 0
                                            ? Math.min(vid.duration * 0.15, 5)
                                            : 0
                                        if (seekTo > 0) {
                                            vid.currentTime = seekTo
                                        } else {
                                            requestAnimationFrame(() => requestAnimationFrame(() => captureAndUpload(vid)))
                                        }
                                    }}
                                    onSeeked={(e) => {
                                        // Must capture currentTarget synchronously — it's null inside rAF
                                        const vid = e.currentTarget
                                        requestAnimationFrame(() => requestAnimationFrame(() => captureAndUpload(vid)))
                                    }}
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-zinc-500">
                                    No Preview
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-zinc-500">Video link</Label>
                                <div className="flex items-center gap-2">
                                    <a href="#" className="text-lantern text-sm truncate hover:underline">{previewLink}</a>
                                    <button onClick={copyLink} className="text-zinc-500 hover:text-white">
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs text-zinc-500">Filename</Label>
                                <p className="text-sm text-zinc-300 truncate" title={file.name}>{file.name}</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom Bar */}
            <div className="flex items-center justify-between px-6 py-4 border-t rounded-b-3xl border-zinc-800 bg-black">
                <div className="flex items-center gap-2">
                    {/* Only show Ticker on Details and Video Elements */}
                    {(currentStep === "details" || currentStep === "video-elements") && (
                        <>
                            <button
                                onClick={() => setIsEditingTicker(true)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-zinc-900/90 hover:bg-zinc-900 transition-all group"
                            >
                                <span className="text-zinc-400 text-sm font-bold tracking-tight">
                                    ${tokenLaunch.ticker || "ticker"}
                                </span>
                            </button>

                            <TickerEditDialog
                                open={isEditingTicker}
                                onOpenChange={setIsEditingTicker}
                                state={tokenLaunch}
                                onSave={(updates) => {
                                    setTokenLaunch(prev => ({ ...prev, ...updates }))
                                }}
                            />
                        </>
                    )}

                    {/* Show "Checks complete" on Checks and Visibility steps */}
                    {(currentStep === "checks" || currentStep === "visibility") && (
                        <div className="flex items-center gap-2 text-zinc-400">
                            <div className="h-4 w-4 rounded-full border border-green-500 flex items-center justify-center">
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-green-500"><polyline points="20 6 9 17 4 12" /></svg>
                            </div>
                            <span className="text-sm">Checks complete. No issues found.</span>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    {isUploading && (
                        <TextShimmer className="text-lg" duration={1.5} spread={2}>
                            {`Uploading ${uploadProgress}%`}
                        </TextShimmer>
                    )}
                    <Button variant="ghost" onClick={handleBack} className="text-white text-lg  hover:bg-zinc-800">
                        Back
                    </Button>

                    <Button onClick={handleNext} className={cn("text-black hover:bg-zinc-200 text-lg font-semibold px-6", currentStep === "visibility" ? "bg-white hover:bg-gray-200" : "bg-white")}>
                        {currentStep === "visibility" ? "Save" : "Next"}
                    </Button>
                </div>
            </div>

            {/* Cards editor sub-dialog (Dialog uses a portal, safe inside parent) */}
            <CardsEditor
                open={cardsEditorOpen}
                onClose={() => setCardsEditorOpen(false)}
                videoUrl={uploadedUrl}
                onDraftChange={setPendingCards}
                initialCards={pendingCards}
            />
        </div>
    )
}
