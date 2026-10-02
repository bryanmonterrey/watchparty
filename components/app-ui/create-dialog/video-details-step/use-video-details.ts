"use client"

import * as React from "react"
import { useCashtagField } from "@/components/browse/use-cashtag-field"
import { toast } from "sonner"
import { useDropzone } from "react-dropzone"
import { trpc } from "@/lib/trpc/client"
import { useAuthSession } from "@/hooks/use-auth-session"
import { useTokenLaunch } from "@/hooks/use-token-launch"
import type { TokenLaunchState } from "../token-launch-section"
import { DEFAULT_TOKEN_LAUNCH } from "../token-launch-section"
import type { DraftCard } from "@/components/video/cards"
import type { EndScreenElement } from "@/components/video/end-screen"
import type { VideoDetailsStepProps, StepType, Collaborator, AllowedCommenter } from "./types"

export function useVideoDetails({ file, uploadedUrl, isUploading, uploadProgress = 0, onBack, onNext }: VideoDetailsStepProps) {
    const [showMore, setShowMore] = React.useState(false)
    const [title, setTitle] = React.useState(file.name.replace(/\.[^/.]+$/, ""))
    const [description, setDescription] = React.useState("")
    const [isEditingTicker, setIsEditingTicker] = React.useState(false)
    const [currentStep, setCurrentStep] = React.useState<StepType>("details")

    const [visibility, setVisibility] = React.useState("public")
    const [selectedPlaylists, setSelectedPlaylists] = React.useState<string[]>([])

    // Token Launch State
    const [tokenLaunch, setTokenLaunch] = React.useState<TokenLaunchState>({ ...DEFAULT_TOKEN_LAUNCH })
    // True from the moment Publish is pressed until the save path settles
    // (including its early returns) — the footer reads it for the busy label
    // and to stop a second press queuing a second createVideo.
    const [isSaving, setIsSaving] = React.useState(false)

    const { launchToken, isLaunching: isTokenLaunching } = useTokenLaunch()

    const createVideoMutation = trpc.content.createVideo.useMutation()

    // Tagging lives HERE, beside the title and description state, not in the
    // step that renders them. The step is unmounted as the wizard advances, so
    // picks made there would be gone by the time submit runs — which is exactly
    // how the first attempt dropped every tag on the floor.
    const titleTags = useCashtagField(title, setTitle)
    const descTags = useCashtagField(description, setDescription)
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
    const [allowedCommenters, setAllowedCommenters] = React.useState<AllowedCommenter[]>([])
    const [commenterSearch, setCommenterSearch] = React.useState("")
    const [commenterSearchOpen, setCommenterSearchOpen] = React.useState(false)
    const [category, setCategory] = React.useState<string>("")
    const [languages, setLanguages] = React.useState<string[]>([])
    const [langPickerOpen, setLangPickerOpen] = React.useState(false)
    const [langSearch, setLangSearch] = React.useState("")
    const [collaborators, setCollaborators] = React.useState<Collaborator[]>([])
    const [collaboratorSearch, setCollaboratorSearch] = React.useState("")
    const [collaboratorSearchOpen, setCollaboratorSearchOpen] = React.useState(false)

    const [cardsEditorOpen, setCardsEditorOpen] = React.useState(false)
    const [pendingCards, setPendingCards] = React.useState<DraftCard[]>([])
    const [endScreenEditorOpen, setEndScreenEditorOpen] = React.useState(false)
    const [pendingEndScreenElements, setPendingEndScreenElements] = React.useState<EndScreenElement[]>([])

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
    const [thumbnailUrlState, setThumbnailUrl] = React.useState<string | undefined>(undefined)
    const thumbnailUrl = thumbnailUrlState
    const [isThumbnailUploading, setIsThumbnailUploading] = React.useState(false)

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation()
    const previewVideoRef = React.useRef<HTMLVideoElement>(null)
    const autoThumbAttempted = React.useRef(false)

    // One upload path for the auto thumbnail, reused at publish time if the
    // first attempt failed. Returns the public URL.
    const uploadThumbnailFile = React.useCallback(async (thumb: File) => {
        const { token, path } = await getPresignedUrl.mutateAsync({
            bucket: 'thumbnails',
            filename: thumb.name.replace(/[^a-zA-Z0-9.-]/g, '_'),
            contentType: thumb.type || 'image/jpeg',
        })
        const { supabase } = await import('@/lib/supabase/client')
        const { data, error } = await supabase.storage.from('thumbnails').uploadToSignedUrl(path, token, thumb)
        if (error) throw error
        return supabase.storage.from('thumbnails').getPublicUrl(data!.path).data.publicUrl
    }, [getPresignedUrl])

    const captureAndUpload = React.useCallback(async (vid: HTMLVideoElement | null) => {
        if (!vid) return
        if (autoThumbAttempted.current) return
        if (thumbnailFile) return
        if (vid.readyState < 2) {
            // No frame decoded yet. This used to just return, and nothing ever
            // called back — one of the ways a video shipped with NO thumbnail.
            vid.addEventListener('loadeddata', () => captureAndUpload(vid), { once: true })
            return
        }
        const canvas = document.createElement('canvas')
        canvas.width = vid.videoWidth || 1280
        canvas.height = vid.videoHeight || 720
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        autoThumbAttempted.current = true
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
                setThumbnailUrl(await uploadThumbnailFile(autoFile))
            } catch (e) {
                // Not fatal here: handleNext retries with the same file at
                // publish, so a blip doesn't cost the video its thumbnail.
                console.error('Auto-thumbnail upload failed', e)
            } finally {
                setIsThumbnailUploading(false)
            }
        }, 'image/jpeg', 0.88)
    }, [uploadThumbnailFile, thumbnailFile])

    // PICK A LIT FRAME, NOT THE FIRST ONE.
    //
    // The auto thumbnail used to be whatever was on screen at min(15%, 5s).
    // Music videos open on black or a fade-in, so that was a black JPEG: on
    // 2026-10-02, 7 of 65 video posts had a pure-black thumbnail (five of them
    // the byte-identical 15 KB image) and the rail looked broken. Now the
    // preview steps through a few points in the video and takes the first frame
    // that isn't dark; if every one is dark (audio over a black card) it settles
    // on the least dark rather than looping.
    // scripts/dev/backfill-video-thumbnails.ts repairs the ones already posted
    // and uses the same idea — keep the thresholds roughly in step.
    const THUMB_SAMPLE_AT = [0.15, 0.3, 0.5, 0.7, 0.85]
    const THUMB_DARK_LUMA = 28
    const thumbQueue = React.useRef<number[]>([])
    const thumbBest = React.useRef<{ t: number; luma: number } | null>(null)
    const thumbSettled = React.useRef(false)

    /** Mean luma (0-255) of the frame on screen. 255 = "can't tell, accept it". */
    const frameLuma = (vid: HTMLVideoElement) => {
        try {
            const c = document.createElement('canvas')
            c.width = 64
            c.height = 36
            const ctx = c.getContext('2d', { willReadFrequently: true })
            if (!ctx) return 255
            ctx.drawImage(vid, 0, 0, c.width, c.height)
            const px = ctx.getImageData(0, 0, c.width, c.height).data
            let sum = 0
            for (let i = 0; i < px.length; i += 4) sum += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
            return sum / (px.length / 4)
        } catch {
            return 255
        }
    }

    const beginAutoThumbnail = React.useCallback((vid: HTMLVideoElement) => {
        if (autoThumbAttempted.current || thumbnailFile) return
        const d = vid.duration
        if (!isFinite(d) || d <= 0) {
            requestAnimationFrame(() => requestAnimationFrame(() => captureAndUpload(vid)))
            return
        }
        thumbQueue.current = THUMB_SAMPLE_AT.map((f) => d * f)
        thumbBest.current = null
        thumbSettled.current = false
        vid.currentTime = thumbQueue.current.shift()!
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [captureAndUpload, thumbnailFile])

    const onPreviewSeeked = React.useCallback((vid: HTMLVideoElement) => {
        // Two frames: the seeked event fires before the new frame is painted.
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (autoThumbAttempted.current || thumbnailFile) return
            if (!thumbSettled.current) {
                const luma = frameLuma(vid)
                if (luma < THUMB_DARK_LUMA) {
                    if (!thumbBest.current || luma > thumbBest.current.luma) thumbBest.current = { t: vid.currentTime, luma }
                    const next = thumbQueue.current.shift()
                    if (next !== undefined) {
                        vid.currentTime = next
                        return
                    }
                    // Dark everywhere we looked: take the least dark and stop.
                    thumbSettled.current = true
                    if (Math.abs(vid.currentTime - thumbBest.current.t) > 0.05) {
                        vid.currentTime = thumbBest.current.t
                        return
                    }
                }
            }
            captureAndUpload(vid)
        }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [captureAndUpload, thumbnailFile])

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

    // /video/<id>, not the old /<user>/<id> — that route is a 308 redirect
    // now, so the copied link worked but sent people through a hop and
    // broke whenever the creator renamed themselves.
    const previewLink = `${origin}/video/${previewId}`

    const copyLink = () => {
        navigator.clipboard.writeText(previewLink)
        toast.success("Link copied to clipboard")
    }

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

            if (isSaving) return
            // Publishing mid-upload sent thumbnailUrl as undefined and the
            // post was saved with no thumbnail at all.
            if (isThumbnailUploading) {
                toast.error("Thumbnail is still uploading — try again in a moment")
                return
            }
            setIsSaving(true)
            try {
                // The file exists but its upload failed earlier: one more go
                // before settling for a post without a thumbnail.
                let thumbnailUrl = thumbnailUrlState
                if (!thumbnailUrl && thumbnailFile) {
                    thumbnailUrl = await uploadThumbnailFile(thumbnailFile).catch(() => undefined)
                    if (thumbnailUrl) setThumbnailUrl(thumbnailUrl)
                }
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

                        const tokenName = title.slice(0, 32) || "Video Coin";
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
                            {
                                name: tokenName,
                                symbol: tokenLaunch.ticker,
                                image: metadataPublicData.publicUrl,
                                description,
                                // Videos live at /video/<postId>; previewId is the
                                // id this flow already hands createVideo below.
                                contentPath: `/video/${previewId}`,
                            },
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
                    // Coins tagged in the title or the description. Deduped by
                    // (network, address) because the same coin can legitimately
                    // be named in both, and the table's PRIMARY KEY is that pair.
                    tags: [...titleTags.tagsIn(title), ...descTags.tagsIn(description)].filter(
                        (t, i, all) =>
                            all.findIndex((o) => o.network === t.network && o.tokenAddress === t.tokenAddress) === i,
                    ),
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
                toast.success("Published")
            } catch (error) {
                toast.error("Failed to save video details")
                console.error(error)
            } finally {
                setIsSaving(false)
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

    return {
        // Step state
        showMore,
        setShowMore,
        title,
        setTitle,
        description,
        setDescription,
        titleTags,
        descTags,
        isEditingTicker,
        setIsEditingTicker,
        currentStep,
        setCurrentStep,
        // Visibility & playlists
        visibility,
        setVisibility,
        selectedPlaylists,
        setSelectedPlaylists,
        // Token launch
        tokenLaunch,
        setTokenLaunch,
        isTokenLaunching,
        isSaving,
        // Advanced settings
        autoChapters,
        setAutoChapters,
        autoPlaces,
        setAutoPlaces,
        remixing,
        setRemixing,
        comments,
        setComments,
        commentModeration,
        setCommentModeration,
        commentSort,
        setCommentSort,
        showLikeCount,
        setShowLikeCount,
        captionCertification,
        setCaptionCertification,
        recordingDate,
        setRecordingDate,
        videoLocation,
        setVideoLocation,
        license,
        setLicense,
        allowEmbedding,
        setAllowEmbedding,
        publishToFeed,
        setPublishToFeed,
        // Enhanced fields
        videoAudience,
        setVideoAudience,
        whoCanComment,
        setWhoCanComment,
        allowedCommenters,
        setAllowedCommenters,
        commenterSearch,
        setCommenterSearch,
        commenterSearchOpen,
        setCommenterSearchOpen,
        category,
        setCategory,
        languages,
        setLanguages,
        langPickerOpen,
        setLangPickerOpen,
        langSearch,
        setLangSearch,
        collaborators,
        setCollaborators,
        collaboratorSearch,
        setCollaboratorSearch,
        collaboratorSearchOpen,
        setCollaboratorSearchOpen,
        // Cards
        cardsEditorOpen,
        setCardsEditorOpen,
        pendingCards,
        setPendingCards,
        // End screen
        endScreenEditorOpen,
        setEndScreenEditorOpen,
        pendingEndScreenElements,
        setPendingEndScreenElements,
        // Search queries
        collaboratorSearchQuery,
        commenterSearchQuery,
        // Thumbnail
        thumbnailFile,
        thumbnailPreview,
        thumbnailUrl,
        isThumbnailUploading,
        getThumbnailRootProps,
        getThumbnailInputProps,
        isThumbnailDragActive,
        // Video
        videoUrl,
        previewVideoRef,
        captureAndUpload,
        beginAutoThumbnail,
        onPreviewSeeked,
        // Preview link
        previewId,
        previewLink,
        copyLink,
        // Handlers
        handleNext,
        handleBack,
    }
}
