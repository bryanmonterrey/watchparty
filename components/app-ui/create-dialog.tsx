"use client"

import * as React from "react"
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { Upload, X, Smile, Calendar, MapPin, Globe, ChevronDown, BarChart2, FileVideo, Trash2, Coins, Users, Medal, Check, BadgeCheck, Plus, Lock, Crown } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuthSession } from "@/hooks/use-auth-session"
import * as VisuallyHidden from "@radix-ui/react-visually-hidden"
import { useDropzone } from "react-dropzone"
import { appToast } from "@/components/app-ui/app-toast"
import { supabase } from "@/lib/supabase/client"
import { trpc } from "@/lib/trpc/client"

import { GifIcon, ImageIcon, MicIcon, CalendarIcon, LockIcon, EmojiIcon, AlertIcon } from "@/components/icons"
import { Switch } from "@/components/ui/switch"
import { VideoDetailsStep } from "./create-dialog/video-details-step"
import { TokenLaunchState, TokenLaunchTrigger, DEFAULT_TOKEN_LAUNCH } from "./create-dialog/token-launch-section"
import { TickerEditDialog } from "./create-dialog/ticker-edit-dialog"
import { useTokenLaunch } from "@/hooks/use-token-launch"
import { EmojiPicker } from "@/components/messages/emoji-picker"
import { GifPicker } from "@/components/messages/gif-picker"
import { VoiceRecorder, VoiceRecorderTrigger } from "@/components/browse/voice-recorder"
import { DraftsDrawer } from "@/components/browse/drafts-drawer"
import { ScheduleDialog } from "@/components/browse/schedule-dialog"
import { ScheduledPostsDrawer } from "@/components/browse/scheduled-posts-drawer"
import { LinkPreviewCard } from "@/components/browse/link-preview-card"
import { useLinkPreview } from "@/hooks/use-link-preview"
import { nanoid } from "nanoid"

interface CreateDialogProps extends React.HTMLAttributes<HTMLElement> {
    children: React.ReactNode
}

type Tab = "video" | "post" | "stream"
type Step = "upload" | "details"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function CreateDialog({ children, ...props }: CreateDialogProps) {
    const [open, setOpen] = React.useState(false)
    const [showCloseAlert, setShowCloseAlert] = React.useState(false)
    const [activeTab, setActiveTab] = React.useState<Tab>("video")
    const { data: session } = useAuthSession()

    // Video Upload State
    const [step, setStep] = React.useState<Step>("upload")
    const [videoFile, setVideoFile] = React.useState<File | null>(null)

    const [uploading, setUploading] = React.useState(false)
    const [uploadProgress, setUploadProgress] = React.useState(0)
    const [uploadedUrl, setUploadedUrl] = React.useState<string | null>(null)

    // Post State
    const [postContent, setPostContent] = React.useState("")
    const [postImages, setPostImages] = React.useState<File[]>([])
    const [postGif, setPostGif] = React.useState<string | null>(null)
    const [isPosting, setIsPosting] = React.useState(false)
    const postImageInputRef = React.useRef<HTMLInputElement>(null)

    // Token Launch State (Post)
    const [tokenLaunch, setTokenLaunch] = React.useState<TokenLaunchState>({ ...DEFAULT_TOKEN_LAUNCH })
    const [isEditingTicker, setIsEditingTicker] = React.useState(false)

    const { launchToken, isLaunching: isTokenLaunching } = useTokenLaunch()

    // Privacy State
    const [audience, setAudience] = React.useState<"everyone" | "followers" | "verified" | "token_holders" | "community">("everyone")
    const [replyPrivacy, setReplyPrivacy] = React.useState<"everyone" | "followers" | "verified" | "token_holders">("everyone")

    // Poll State
    const [showPoll, setShowPoll] = React.useState(false)
    const [pollQuestion, setPollQuestion] = React.useState("")
    const [pollOptions, setPollOptions] = React.useState([{ id: nanoid(), text: "" }, { id: nanoid(), text: "" }])
    const [pollEndsAt, setPollEndsAt] = React.useState<"1d" | "3d" | "7d">("1d")

    // Paywall State
    const [isPaywalled, setIsPaywalled] = React.useState(false)
    const [paywallPrice, setPaywallPrice] = React.useState<number>(0.1)

    // Voice State
    const [showVoiceRecorder, setShowVoiceRecorder] = React.useState(false)
    const [voiceBlob, setVoiceBlob] = React.useState<Blob | null>(null)
    const [voiceDuration, setVoiceDuration] = React.useState(0)

    // Content Warning State
    const [hasContentWarning, setHasContentWarning] = React.useState(false)
    const [contentWarningText, setContentWarningText] = React.useState("")

    // Schedule / Drafts State
    const [showDrafts, setShowDrafts] = React.useState(false)
    const [showSchedule, setShowSchedule] = React.useState(false)
    const [showScheduledPosts, setShowScheduledPosts] = React.useState(false)
    const [scheduledFor, setScheduledFor] = React.useState<Date | undefined>()
    const [dismissedPreview, setDismissedPreview] = React.useState(false)

    // Link Preview
    const { preview: linkPreview, loading: previewLoading, clearPreview } = useLinkPreview(postContent)

    // Mock user communities until DB schema is built
    const userCommunities: any[] = []

    // Auto-generate ticker from post content
    // Auto-generate ticker from post content for Posts
    React.useEffect(() => {
        if (!tokenLaunch.isTickerManuallyEdited && postContent) {
            // Take first 15 chars of content (lines), uppercase, remove non-alphanumeric
            const autoTicker = postContent
                .split('\n')[0] // Use first line for ticker source
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, "")
                .slice(0, 15)

            setTokenLaunch(prev => ({ ...prev, ticker: autoTicker }))
        }
    }, [postContent, tokenLaunch.isTickerManuallyEdited])

    // Auto-generate token name from post content (first line, title-cased, capped),
    // unless the user set one explicitly in the ticker dialog.
    React.useEffect(() => {
        if (!tokenLaunch.isNameManuallyEdited && postContent) {
            const autoName = postContent.split('\n')[0].trim().slice(0, 32)
            setTokenLaunch(prev => ({ ...prev, name: autoName }))
        }
    }, [postContent, tokenLaunch.isNameManuallyEdited])

    // Reset state when dialog is closed with a slight delay to allow exit animation
    React.useEffect(() => {
        if (!open) {
            const timeoutId = setTimeout(() => {
                setShowCloseAlert(false)
                setActiveTab("video")
                setStep("upload")
                setVideoFile(null)
                setUploading(false)
                setUploadProgress(0)
                setUploadedUrl(null)
                setPostContent("")
                setPostImages([])
                setPostGif(null)
                setIsPosting(false)
                setIsEditingTicker(false)
                setTokenLaunch({ ...DEFAULT_TOKEN_LAUNCH })
                setAudience("everyone")
                setReplyPrivacy("everyone")
                setShowPoll(false)
                setPollQuestion("")
                setPollOptions([{ id: nanoid(), text: "" }, { id: nanoid(), text: "" }])
                setPollEndsAt("1d")
                setIsPaywalled(false)
                setPaywallPrice(0.1)
                setShowVoiceRecorder(false)
                setVoiceBlob(null)
                setVoiceDuration(0)
                setHasContentWarning(false)
                setContentWarningText("")
                setScheduledFor(undefined)
                setDismissedPreview(false)
                clearPreview?.()
            }, 300)

            return () => clearTimeout(timeoutId)
        }
    }, [open])

    const createPostMutation = trpc.content.createPost.useMutation({
        onSuccess: (_, vars) => {
            appToast.success(vars.status === "scheduled" ? "Post scheduled!" : "Post created!")
            setOpen(false)
            setPostContent("")
            setPostImages([])
            setPostGif(null)
            setIsPosting(false)
            setTokenLaunch({ ...DEFAULT_TOKEN_LAUNCH })
        },
        onError: (error) => {
            appToast.error(error.message)
            setIsPosting(false)
        }
    })

    const saveDraftMutation = trpc.content.createPost.useMutation({
        onSuccess: () => {
            appToast.success("Draft saved")
            setOpen(false)
        },
        onError: (error) => {
            appToast.error(error.message)
        }
    })

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation()

    const handlePostSubmit = async () => {
        if (!postContent.trim() && postImages.length === 0 && !postGif) return
        if (postContent.length > 150) {
            appToast.error("Posts are limited to 150 characters.");
            return;
        }
        if (isPosting || isTokenLaunching) return

        setIsPosting(true)
        let imageUrls: string[] = []
        let primaryImageUrl = ""

        // Token Launch Logic
        let tokenData = {
            tokenAddress: undefined as string | undefined,
            poolAddress: undefined as string | undefined,
            tokenStatus: undefined as "draft" | "live" | undefined
        }

        try {
            // 1. Process Images
            if (postImages.length > 0) {
                const { supabase } = await import('@/lib/supabase/client')
                for (const img of postImages) {
                    const sanitizedFileName = img.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                    const { token, path } = await getPresignedUrl.mutateAsync({
                        bucket: 'posts',
                        filename: sanitizedFileName,
                        contentType: img.type
                    });
                    const { data, error } = await supabase.storage
                        .from('posts')
                        .uploadToSignedUrl(path, token, img)
                    if (error) throw error;
                    if (data) imageUrls.push(data.fullPath);
                }
                const { data: publicUrlData } = supabase.storage.from('posts').getPublicUrl(imageUrls[0]);
                primaryImageUrl = publicUrlData.publicUrl;
            } else {
                // If text only, generate an OG Twitter-style Post Image and upload it
                const generatedImageUrl = `${window.location.origin}/api/og/post?text=${encodeURIComponent(postContent.slice(0, 150))}&name=${encodeURIComponent(session?.user?.name || 'User')}&username=${encodeURIComponent(session?.user?.username || '')}&avatar=${encodeURIComponent(session?.user?.avatar_url || '')}`

                // Fetch the generated image and upload it to Supabase so it has a permanent public URL
                const response = await fetch(generatedImageUrl);
                const blob = await response.blob();
                const file = new File([blob], `generated_post_${Date.now()}.png`, { type: "image/png" });

                const { supabase } = await import('@/lib/supabase/client')
                const { token, path } = await getPresignedUrl.mutateAsync({
                    bucket: 'posts',
                    filename: file.name,
                    contentType: file.type
                });

                const { data, error } = await supabase.storage
                    .from('posts')
                    .uploadToSignedUrl(path, token, file)

                if (error) throw error;
                if (data) {
                    const { data: publicUrlData } = supabase.storage.from('posts').getPublicUrl(data.fullPath);
                    primaryImageUrl = publicUrlData.publicUrl;
                }
            }

            if (tokenLaunch.earningsEnabled) {
                if (!tokenLaunch.ticker) {
                    appToast.error("Ticker symbol is required for earnings")
                    setIsPosting(false)
                    return
                }

                const tokenName = postContent.slice(0, 32) || "Post Token"

                // Construct Standard Metadata JSON for On-Chain Display
                const metadataJson = {
                    name: tokenName,
                    symbol: tokenLaunch.ticker,
                    description: postContent,
                    image: primaryImageUrl
                };

                const metadataBlob = new Blob([JSON.stringify(metadataJson)], { type: 'application/json' });
                const metadataFile = new File([metadataBlob], 'metadata.json', { type: 'application/json' });

                const { token, path } = await getPresignedUrl.mutateAsync({
                    bucket: 'posts',
                    filename: `metadata_${Date.now()}.json`,
                    contentType: 'application/json'
                });

                const { supabase } = await import('@/lib/supabase/client')
                const { data: metaDataRaw, error: metaError } = await supabase.storage
                    .from('posts')
                    .uploadToSignedUrl(path, token, metadataFile)

                if (metaError) throw metaError;

                const { data: publicUrlData } = supabase.storage.from('posts').getPublicUrl(metaDataRaw!.path);
                const metadataUri = publicUrlData.publicUrl;

                const launchResult = await launchToken(
                    {
                        name: tokenName,
                        symbol: tokenLaunch.ticker,
                        image: metadataUri,
                        description: postContent
                    },
                    tokenLaunch
                )

                if (!launchResult.success) {
                    setIsPosting(false)
                    return // Error handled in hook
                }

                if (launchResult.status) {
                    tokenData.tokenStatus = launchResult.status as "draft" | "live"
                    tokenData.tokenAddress = launchResult.tokenAddress
                    tokenData.poolAddress = launchResult.poolAddress
                }
            }

            // Upload voice note if present
            let voiceNoteUrl: string | undefined
            if (voiceBlob) {
                const vf = new File([voiceBlob], `voice_${Date.now()}.webm`, { type: "audio/webm" })
                const sanitizedVoice = vf.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                const { token: vt, path: vp } = await getPresignedUrl.mutateAsync({ bucket: 'posts', filename: sanitizedVoice, contentType: vf.type });
                const { data: vd, error: ve } = await supabase.storage.from('posts').uploadToSignedUrl(vp, vt, vf);
                if (ve) throw ve;
                if (vd) {
                    const { data: vpub } = supabase.storage.from('posts').getPublicUrl(vd.fullPath);
                    voiceNoteUrl = vpub.publicUrl;
                }
            }

            const validPollOptions = pollOptions.filter(o => o.text.trim())
            const postImageUrl = imageUrls.length > 0 ? imageUrls.join(',') : (postGif || primaryImageUrl || undefined)
            // Token image fallback chain: post media (first image/gif) -> user avatar.
            // (Video posts set their token image from the thumbnail in the video flow.)
            const tokenImage = (postImageUrl?.split(',')[0]) || session?.user?.avatar_url || undefined
            const payload = {
                content: postContent,
                imageUrl: postImageUrl,
                visibility: "public" as const,
                audience: audience,
                replyPrivacy: replyPrivacy,
                // Token Launch Data
                earningsEnabled: tokenLaunch.earningsEnabled,
                ticker: tokenLaunch.ticker || undefined,
                tokenName: tokenLaunch.name?.trim() || undefined,
                token_image: tokenImage,
                twitterUrl: tokenLaunch.twitterUrl?.trim() || undefined,
                telegramUrl: tokenLaunch.telegramUrl?.trim() || undefined,
                websiteUrl: tokenLaunch.websiteUrl?.trim() || undefined,
                creatorFeePercent: tokenLaunch.earningsEnabled ? tokenLaunch.creatorFee : undefined,
                tokenAddress: tokenData.tokenAddress,
                poolAddress: tokenData.poolAddress,
                tokenStatus: tokenData.tokenStatus,
                splits: tokenLaunch.earningsEnabled && tokenLaunch.splits.length > 0
                    ? tokenLaunch.splits
                    : undefined,
                // New features
                status: scheduledFor ? "scheduled" as const : "published" as const,
                scheduledFor,
                isPaywalled,
                paywallPrice: isPaywalled ? Math.round(paywallPrice * 1_000_000_000) : undefined,
                linkPreview: (!dismissedPreview && linkPreview) ? linkPreview : undefined,
                hasContentWarning: hasContentWarning || undefined,
                contentWarningText: hasContentWarning ? contentWarningText || undefined : undefined,
                poll: showPoll && pollQuestion.trim() && validPollOptions.length >= 2 ? {
                    question: pollQuestion.trim(),
                    options: validPollOptions.map(o => ({ id: o.id, text: o.text.trim() })),
                    allowMultiple: false,
                    endsAt: new Date(Date.now() + ({ "1d": 86400000, "3d": 259200000, "7d": 604800000 }[pollEndsAt])),
                } : undefined,
                voiceNoteUrl,
            };

            createPostMutation.mutate(payload)

        } catch (error) {
            console.error(error)
            appToast.error("Failed to create post")
            setIsPosting(false)
        }
    }

    const handleSaveDraft = () => {
        if (!postContent.trim() && postImages.length === 0 && !postGif) return
        saveDraftMutation.mutate({ content: postContent.trim() || undefined, visibility: "public", audience, replyPrivacy, status: "draft" })
    }

    const onDrop = React.useCallback(async (acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const file = acceptedFiles[0]

            // Check file size (e.g., 100GB limit)
            const MAX_SIZE = 100 * 1024 * 1024 * 1024 // 100GB
            if (file.size > MAX_SIZE) {
                appToast.error("File is too large. Max size is 100GB.")
                return
            }

            setVideoFile(file)
            setStep("details")

            // Start Upload
            setUploading(true)
            setUploadProgress(0)

            try {
                // 1. Get Presigned URL
                const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
                const { path, signedUrl } = await getPresignedUrl.mutateAsync({
                    bucket: 'videos',
                    filename: sanitizedFileName,
                    contentType: file.type
                });

                // 2. Upload via XHR — gives real progress and avoids FormData wrapping
                //    which can OOM the browser tab on large video files.
                //    The signedUrl already embeds the auth token so no extra auth header needed.
                await new Promise<void>((resolve, reject) => {
                    const xhr = new XMLHttpRequest()
                    xhr.upload.addEventListener('progress', (e) => {
                        if (e.lengthComputable) {
                            setUploadProgress(Math.round((e.loaded / e.total) * 100))
                        }
                    })
                    xhr.addEventListener('load', () => {
                        xhr.status >= 200 && xhr.status < 300
                            ? resolve()
                            : reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`))
                    })
                    xhr.addEventListener('error', () => reject(new Error('Network error during upload')))
                    xhr.open('PUT', signedUrl)
                    xhr.setRequestHeader('content-type', file.type)
                    xhr.setRequestHeader('cache-control', 'max-age=3600')
                    xhr.send(file)
                })

                const { supabase } = await import('@/lib/supabase/client')
                const { data: publicUrlData } = supabase.storage.from('videos').getPublicUrl(path)
                setUploadedUrl(publicUrlData.publicUrl)
                setUploadProgress(100)
                setUploading(false)
                appToast.success("Upload complete")
            } catch (error: any) {
                console.error("Upload error:", error)
                appToast.error(`Upload failed: ${error.message}`)
                setUploading(false)
            }
        }
    }, [getPresignedUrl])

    const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
        onDrop,
        accept: {
            'video/*': []
        },
        maxSize: 100 * 1024 * 1024 * 1024, // 100GB
        maxFiles: 1,
    })

    React.useEffect(() => {
        if (fileRejections.length > 0) {
            fileRejections.forEach(({ errors }) => {
                errors.forEach(({ code }) => {
                    if (code === "file-too-large") {
                        appToast.error("File is too large. Max size is 100GB.")
                    } else if (code === "file-invalid-type") {
                        appToast.error("Invalid file type. Please upload a video.")
                    } else {
                        appToast.error("Error uploading file.")
                    }
                })
            })
        }
    }, [fileRejections])

    const resetUpload = () => {
        setVideoFile(null)
        setStep("upload")
    }

    const formatFileSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    return (
        <>
            <Dialog open={open} onOpenChange={(val) => {
                if (!val && step === "details") {
                    // If closing and in details step, show alert
                    setShowCloseAlert(true)
                    // Do NOT setOpen(false) yet
                } else {
                    setOpen(val)
                    // If closing (val === false), reset to upload is handled by the simple toggle for non-details steps
                    // or if we just finished uploading.
                    // For 'upload' step, we want to reset if they re-open?
                    // User said: "it should not open again in the video-details section".
                    // So if we close normally, we should reset.
                    if (!val) {
                        setTimeout(() => {
                            setStep("upload")
                            setVideoFile(null)
                        }, 300)
                    }
                }
            }}>
                <DialogTrigger asChild {...props}>
                    {children}
                </DialogTrigger>
                <DialogContent className={cn(
                    "fixed left-[50%] z-50 grid w-full translate-x-[-50%] border border-zinc-800 bg-black p-0 shadow-lg duration-200 sm:rounded-4xl transition-all max-w-[900px] md:max-w-4xl",
                    step === "upload" ? "top-[10vh] translate-y-0" : "top-[50%] translate-y-[-50%]"
                )}>
                    <VisuallyHidden.Root>
                        <DialogTitle>Create Content</DialogTitle>
                        <DialogDescription>Create a new video, post, or stream with token launch capabilities.</DialogDescription>
                    </VisuallyHidden.Root>

                    {/* Header with Tabs (Only show in Upload step) */}
                    {step === "upload" && (
                        <div className="flex items-center justify-between px-6 pt-6 pb-2">
                            <div className="flex items-center gap-6 relative">
                                {(["video", "post", "stream"] as Tab[]).map((tab) => (
                                    <button
                                        key={tab}
                                        onClick={() => setActiveTab(tab)}
                                        className={cn(
                                            "relative px-1 py-1 text-base cursor-pointer font-medium capitalize transition-colors",
                                            activeTab === tab ? "text-white cursor-default" : "text-zinc-500 hover:text-zinc-300"
                                        )}
                                    >
                                        {tab}
                                        {activeTab === tab && (
                                            <motion.div
                                                layoutId="active-tab-underline"
                                                className="absolute bottom-[-5px] left-0 right-0 rounded-full h-[2px] bg-white"
                                                initial={false}
                                                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                            />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Content Area */}
                    <div className={cn("p-0", step === "upload" && "p-6 pt-2", step === "upload" && activeTab !== "post" && "min-h-[500px]")}>
                        <AnimatePresence mode="wait">
                            {activeTab === "video" ? (
                                <motion.div
                                    key="video"
                                    initial={{ opacity: 1, y: 0 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.125 }}
                                    className="h-full"
                                >
                                    {step === "upload" ? (
                                        <div
                                            className={cn(
                                                "flex flex-col items-center justify-center h-full min-h-[350px] rounded-xl transition-colors outline-none",
                                                isDragActive ? "bg-zinc-900/50 border-2 border-dashed border-lantern/50" : ""
                                            )}
                                            {...getRootProps()}
                                        >
                                            <input {...getInputProps()} />
                                            <div className="flex items-center justify-center w-20 h-20 bg-zinc-800/50 rounded-full mb-6 relative group cursor-pointer hover:bg-zinc-800 transition-colors">
                                                <Upload className={cn("w-8 h-8 text-zinc-400 transition-colors", isDragActive ? "text-lantern animate-bounce" : "group-hover:text-white")} />
                                            </div>
                                            <h3 className="text-lg font-medium text-white mb-2">
                                                {isDragActive ? "Drop video here" : "Upload Video"}
                                            </h3>
                                            <Button variant="secondary" className="bg-white h-11 text-black hover:bg-zinc-200 rounded-full px-8 font-semibold mb-8">
                                                select files
                                            </Button>
                                            <p className="text-xs text-zinc-500 text-center max-w-sm leading-relaxed px-4">
                                                By submitting your videos to Watchparty, you acknowledge that you agree to Watchparty's <a href="#" onClick={(e) => e.stopPropagation()} className="underline hover:text-zinc-300">Terms of Service</a> and <a href="#" onClick={(e) => e.stopPropagation()} className="underline hover:text-zinc-300">Community Guidelines</a>.
                                                <br />
                                                Please be sure not to violate others' copyright or privacy rights. <a href="#" onClick={(e) => e.stopPropagation()} className="underline hover:text-zinc-300">Learn more</a>
                                            </p>
                                        </div>
                                    ) : (
                                        <VideoDetailsStep
                                            file={videoFile!}
                                            uploadedUrl={uploadedUrl}
                                            isUploading={uploading}
                                            uploadProgress={uploadProgress}
                                            onBack={resetUpload}
                                            onNext={() => setOpen(false)}
                                        />
                                    )}
                                </motion.div>
                            ) : activeTab === "post" && step === "upload" ? (
                                <motion.div
                                    key="post"
                                    initial={{ opacity: 1, y: 0 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.125 }}
                                    className="flex flex-col h-full"
                                >
                                    <div className="flex gap-4 rounded-3xl">
                                        <Avatar className="w-10 h-10 border border-white/10">
                                            <AvatarImage src={session?.user?.avatar_url || ""} />
                                            <AvatarFallback></AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1 space-y-4">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <button className="flex items-center gap-1.5 px-3 py-1 rounded-full cursor-pointer text-twitter2 text-sm font-medium hover:bg-white/15 bg-white/10 transition-colors w-fit outline-none">
                                                        {audience === "everyone" && "Everyone"}
                                                        {audience === "followers" && "Followers"}
                                                        {audience === "verified" && "Verified"}
                                                        {audience === "token_holders" && "Token Holders"}
                                                        {audience === "community" && "Community"}
                                                        <ChevronDown className="w-4 h-4" />
                                                    </button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="start" className="w-[300px] bg-zinc-900 border-zinc-800 rounded-xl p-0 overflow-hidden shadow-2xl">
                                                    <div className="p-4 border-b border-zinc-800">
                                                        <h3 className="font-bold text-white text-base">Choose audience</h3>
                                                    </div>
                                                    <div className="p-1">
                                                        <DropdownMenuItem onClick={() => setAudience("everyone")} className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 rounded-lg focus:bg-white/5">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500">
                                                                    <Globe className="w-5 h-5" />
                                                                </div>
                                                                <span className="font-semibold text-white">Everyone</span>
                                                            </div>
                                                            {audience === "everyone" && <Check className="w-5 h-5 text-blue-500" />}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => setAudience("followers")} className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 rounded-lg focus:bg-white/5">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-500">
                                                                    <Users className="w-5 h-5" />
                                                                </div>
                                                                <span className="font-semibold text-white">Followers</span>
                                                            </div>
                                                            {audience === "followers" && <Check className="w-5 h-5 text-blue-500" />}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => setAudience("verified")} className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 rounded-lg focus:bg-white/5">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-500">
                                                                    <BadgeCheck className="w-5 h-5" />
                                                                </div>
                                                                <span className="font-semibold text-white">Verified</span>
                                                            </div>
                                                            {audience === "verified" && <Check className="w-5 h-5 text-blue-500" />}
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => setAudience("token_holders")} className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 rounded-lg focus:bg-white/5">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500">
                                                                    <Medal className="w-5 h-5" />
                                                                </div>
                                                                <span className="font-semibold text-white">Token Holders</span>
                                                            </div>
                                                            {audience === "token_holders" && <Check className="w-5 h-5 text-blue-500" />}
                                                        </DropdownMenuItem>
                                                    </div>

                                                    {userCommunities.length > 0 && (
                                                        <>
                                                            <DropdownMenuSeparator className="bg-zinc-800" />
                                                            <div className="p-4 pb-2">
                                                                <h4 className="text-sm font-bold text-white">My Communities</h4>
                                                            </div>
                                                            <div className="p-1">
                                                                {userCommunities.map((community, i) => (
                                                                    <DropdownMenuItem key={i} onClick={() => setAudience("community")} className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 rounded-lg focus:bg-white/5">
                                                                        <div className="flex items-center gap-3">
                                                                            <Avatar className="w-10 h-10 rounded-lg">
                                                                                <AvatarImage src={community.imageUrl} />
                                                                                <AvatarFallback className="rounded-lg bg-zinc-800">{community.name.charAt(0)}</AvatarFallback>
                                                                            </Avatar>
                                                                            <div className="flex flex-col">
                                                                                <span className="font-semibold text-white">{community.name}</span>
                                                                                <span className="text-sm text-zinc-400">{community.membersCount} Members</span>
                                                                            </div>
                                                                        </div>
                                                                        {audience === "community" && <Check className="w-5 h-5 text-blue-500" />}
                                                                    </DropdownMenuItem>
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}
                                                </DropdownMenuContent>
                                            </DropdownMenu>

                                            <textarea
                                                placeholder="What's happening?"
                                                className="w-full bg-transparent text-xl placeholder:text-zinc-600 outline-none resize-none h-32"
                                                autoFocus
                                                value={postContent}
                                                onChange={(e) => setPostContent(e.target.value)}
                                            />

                                            {postImages.length > 0 && (
                                                <div className={cn("grid gap-2 mb-4", postImages.length === 1 ? "grid-cols-1 max-w-[280px]" : "grid-cols-2 max-w-md")}>
                                                    {postImages.map((img, i) => (
                                                        <div key={i} className="relative w-full aspect-video rounded-xl overflow-hidden border border-zinc-800 group">
                                                            <img
                                                                src={URL.createObjectURL(img)}
                                                                alt={`Upload preview ${i + 1}`}
                                                                className="w-full h-full object-cover bg-zinc-900"
                                                            />
                                                            <button
                                                                onClick={() => setPostImages(prev => prev.filter((_, idx) => idx !== i))}
                                                                className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                                            >
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {postGif && (
                                                <div className="relative w-full max-w-[280px] aspect-video rounded-xl overflow-hidden border border-zinc-800 group mb-4">
                                                    <img
                                                        src={postGif}
                                                        alt="Selected GIF"
                                                        className="w-full h-full object-cover bg-zinc-900"
                                                    />
                                                    <button
                                                        onClick={() => setPostGif(null)}
                                                        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full transition-colors opacity-0 group-hover:opacity-100"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}

                                            {/* Link preview */}
                                            {!dismissedPreview && linkPreview && (
                                                <div className="mb-3 relative">
                                                    <LinkPreviewCard preview={linkPreview} />
                                                    <button onClick={() => setDismissedPreview(true)} className="absolute top-2 right-2 p-1 bg-black/60 hover:bg-black/80 text-white rounded-full">
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                            {previewLoading && <div className="mb-2 text-xs text-zinc-500 animate-pulse">Fetching link preview…</div>}

                                            {/* Paywall */}
                                            {isPaywalled && (
                                                <div className="mb-3 flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 border border-white/10">
                                                    <LockIcon className="w-4 h-4 text-lantern shrink-0" />
                                                    <div className="flex-1 flex items-center gap-2">
                                                        <span className="text-sm text-zinc-300">Price:</span>
                                                        <input type="number" min="0.001" step="0.001" value={paywallPrice} onChange={e => setPaywallPrice(Number(e.target.value))} className="w-20 bg-transparent border-b border-white/20 text-sm text-zinc-100 outline-none text-center" />
                                                        <span className="text-sm text-zinc-400">SOL</span>
                                                    </div>
                                                    <button onClick={() => setIsPaywalled(false)} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
                                                </div>
                                            )}

                                            {/* Poll */}
                                            {showPoll && (
                                                <div className="mb-3 p-3 rounded-xl bg-zinc-900/50 border border-white/10 flex flex-col gap-2">
                                                    <input placeholder="Ask a question…" value={pollQuestion} onChange={e => setPollQuestion(e.target.value)} className="bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none border-b border-white/10 focus:border-white/30 pb-1" />
                                                    {pollOptions.map((opt, i) => (
                                                        <div key={opt.id} className="flex items-center gap-2">
                                                            <input
                                                                placeholder={`Choice ${i + 1}`}
                                                                value={opt.text}
                                                                onChange={e => setPollOptions(prev => prev.map((o, idx) => idx === i ? { ...o, text: e.target.value } : o))}
                                                                className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 outline-none border-b border-white/10 focus:border-white/30 pb-1"
                                                            />
                                                            {pollOptions.length > 2 && (
                                                                <button onClick={() => setPollOptions(prev => prev.filter((_, idx) => idx !== i))} className="text-zinc-500 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {pollOptions.length < 4 && (
                                                        <button onClick={() => setPollOptions(prev => [...prev, { id: nanoid(), text: "" }])} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                                                            <Plus className="w-3.5 h-3.5" /> Add option
                                                        </button>
                                                    )}
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-xs text-zinc-500">Duration:</span>
                                                        {(["1d", "3d", "7d"] as const).map(d => (
                                                            <button key={d} onClick={() => setPollEndsAt(d)} className={cn("text-xs px-2 py-0.5 rounded-full transition-colors", pollEndsAt === d ? "bg-white/20 text-white" : "text-zinc-500 hover:text-zinc-300")}>{d}</button>
                                                        ))}
                                                        <button onClick={() => setShowPoll(false)} className="ml-auto text-zinc-500 hover:text-zinc-300"><X className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Voice recorder */}
                                            {showVoiceRecorder && (
                                                <div className="mb-3">
                                                    <VoiceRecorder
                                                        onAudioReady={(blob, dur) => { setVoiceBlob(blob); setVoiceDuration(dur); setShowVoiceRecorder(false); }}
                                                        onCancel={() => { setVoiceBlob(null); setVoiceDuration(0); setShowVoiceRecorder(false); }}
                                                    />
                                                </div>
                                            )}
                                            {voiceBlob && !showVoiceRecorder && (
                                                <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900/60 border border-white/10">
                                                    <MicIcon className="w-4 h-4 text-lantern shrink-0" />
                                                    <span className="text-sm text-zinc-300">Voice note ({Math.floor(voiceDuration / 60)}:{String(voiceDuration % 60).padStart(2, "0")})</span>
                                                    <button onClick={() => { setVoiceBlob(null); setVoiceDuration(0); }} className="ml-auto text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
                                                </div>
                                            )}
                                            
                                            {/* Content Warning Toggle Pill - Only when media is present */}
                                            {(postImages.length > 0 || !!postGif) && (
                                                <div className="mt-3 flex flex-col gap-2">
                                                    <div className="flex items-center justify-between px-3 py-2 rounded-full w-fit gap-6 transition-all hover:bg-zinc-900/80">
                                                        <div className="flex items-center gap-2.5">
                                                            <AlertIcon className="w-5 h-5 text-twitter2" />
                                                            <span className="text-[13px] font-bold text-zinc-300">Content Warning</span>
                                                        </div>
                                                        <Switch
                                                            checked={hasContentWarning}
                                                            onCheckedChange={(checked) => {
                                                                setHasContentWarning(checked);
                                                                if (!checked) setContentWarningText("");
                                                            }}
                                                            className="data-[state=checked]:bg-twitter2"
                                                        />
                                                    </div>
                                                    
                                                    {hasContentWarning && (
                                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl">
                                                            <input
                                                                value={contentWarningText}
                                                                onChange={e => setContentWarningText(e.target.value)}
                                                                placeholder="Describe the sensitive content (optional)"
                                                                className="flex-1 bg-transparent text-[13px] text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex items-center pb-4 border-b border-zinc-800">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <button className="flex cursor-pointer items-center gap-2 text-twitter2 hover:text-twitter2 hover:bg-white/10 px-2 py-2 rounded-full transition-colors text-sm font-medium outline-none">
                                                            {replyPrivacy === "everyone" && <><Globe className="w-4 h-4" /> Everyone can reply</>}
                                                            {replyPrivacy === "followers" && <><Users className="w-4 h-4" /> Followers can reply</>}
                                                            {replyPrivacy === "verified" && <><BadgeCheck className="w-4 h-4" /> Verified can reply</>}
                                                            {replyPrivacy === "token_holders" && <><Medal className="w-4 h-4" /> Token Holders can reply</>}
                                                        </button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="start" className="w-[300px] bg-zinc-900 border-zinc-800 rounded-xl p-0 overflow-hidden shadow-2xl">
                                                        <div className="p-4 border-b border-zinc-800 flex flex-col gap-1">
                                                            <h3 className="font-bold text-white text-base">Who can reply?</h3>
                                                            <p className="text-zinc-400 text-sm">Choose who can reply to this post.<br />Anyone mentioned can always reply.</p>
                                                        </div>
                                                        <div className="p-1">
                                                            <DropdownMenuItem onClick={() => setReplyPrivacy("everyone")} className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 rounded-lg focus:bg-white/5">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center">
                                                                        <Globe className="w-5 h-5" />
                                                                    </div>
                                                                    <span className="font-semibold text-white">Everyone</span>
                                                                </div>
                                                                {replyPrivacy === "everyone" && <Check className="w-5 h-5 text-blue-500" />}
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => setReplyPrivacy("followers")} className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 rounded-lg focus:bg-white/5">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center">
                                                                        <Users className="w-5 h-5" />
                                                                    </div>
                                                                    <span className="font-semibold text-white">Accounts you follow</span>
                                                                </div>
                                                                {replyPrivacy === "followers" && <Check className="w-5 h-5 text-blue-500" />}
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => setReplyPrivacy("verified")} className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 rounded-lg focus:bg-white/5">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center">
                                                                        <BadgeCheck className="w-5 h-5" />
                                                                    </div>
                                                                    <span className="font-semibold text-white">Verified accounts</span>
                                                                </div>
                                                                {replyPrivacy === "verified" && <Check className="w-5 h-5 text-blue-500" />}
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => setReplyPrivacy("token_holders")} className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 rounded-lg focus:bg-white/5">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center">
                                                                        <Medal className="w-5 h-5" />
                                                                    </div>
                                                                    <span className="font-semibold text-white">Token Holders</span>
                                                                </div>
                                                                {replyPrivacy === "token_holders" && <Check className="w-5 h-5 text-blue-500" />}
                                                            </DropdownMenuItem>
                                                        </div>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </div>

                                            <TickerEditDialog
                                                open={isEditingTicker}
                                                onOpenChange={setIsEditingTicker}
                                                state={tokenLaunch}
                                                onSave={(updates) => setTokenLaunch(prev => ({ ...prev, ...updates }))}
                                            />

                                            {/* Save draft / Drafts header row */}
                                            {(postContent.trim() || postImages.length > 0 || !!postGif) && (
                                                <div className="flex items-center gap-2 mb-2">
                                                    <button
                                                        onClick={handleSaveDraft}
                                                        disabled={saveDraftMutation.isPending}
                                                        className="text-sm font-bold text-twitter2 hover:text-twitter2/80 transition-colors px-2 py-1 rounded-full hover:bg-twitter2/10 disabled:opacity-40 cursor-pointer"
                                                    >
                                                        Save draft
                                                    </button>
                                                    <button
                                                        onClick={() => setShowDrafts(true)}
                                                        className="text-sm font-bold text-twitter2 hover:text-twitter2/80 transition-colors px-2 py-1 rounded-full hover:bg-twitter2/10 cursor-pointer"
                                                    >
                                                        Drafts
                                                    </button>
                                                </div>
                                            )}

                                            <div className="flex items-center justify-between mt-2">
                                                <div className="flex items-center gap-0.5 text-pastelgray">
                                                    <input
                                                        type="file"
                                                        multiple
                                                        ref={postImageInputRef}
                                                        className="hidden"
                                                        accept="image/*"
                                                        onChange={(e) => {
                                                            if (e.target.files?.length) {
                                                                const files = Array.from(e.target.files)
                                                                setPostImages(prev => [...prev, ...files].slice(0, 4))
                                                            }
                                                        }}
                                                    />
                                                    <button
                                                        onClick={() => postImageInputRef.current?.click()}
                                                        className="p-2 hover:bg-white/10 cursor-pointer rounded-full transition-colors"
                                                    >
                                                        <ImageIcon className="w-[22px] h-[22px]" />
                                                    </button>
                                                    <GifPicker onGifSelect={(url) => setPostGif(url)}>
                                                        <button className="p-2 hover:bg-white/10 cursor-pointer rounded-full transition-colors">
                                                            <GifIcon className="w-[22px] h-[22px]" />
                                                        </button>
                                                    </GifPicker>
                                                    <EmojiPicker onEmojiSelect={(emoji) => setPostContent(prev => prev + emoji.native)}>
                                                        <button className="p-2 hover:bg-white/10 cursor-pointer rounded-full transition-colors">
                                                            <EmojiIcon className="w-[22px] h-[22px]" />
                                                        </button>
                                                    </EmojiPicker>
                                                    <button onClick={() => setShowPoll(p => !p)} className={cn("p-2 cursor-pointer rounded-full transition-colors", showPoll ? "text-lantern bg-lantern/10" : "hover:bg-white/10")}>
                                                        <BarChart2 className="w-[22px] h-[22px]" />
                                                    </button>
                                                    <button onClick={() => setIsPaywalled(p => !p)} className={cn("p-2 cursor-pointer rounded-full transition-colors", isPaywalled ? "text-lantern bg-lantern/10" : "hover:bg-white/10")}>
                                                        <LockIcon className="w-[22px] h-[22px]" />
                                                    </button>
                                                    <VoiceRecorderTrigger onClick={() => setShowVoiceRecorder(p => !p)} active={showVoiceRecorder} />
                                                    <Popover>
                                                        <PopoverTrigger asChild>
                                                            <button
                                                                className={cn(
                                                                    "p-2 cursor-pointer rounded-full transition-colors",
                                                                    scheduledFor ? "text-lantern bg-lantern/10" : "hover:bg-white/10"
                                                                )}
                                                                title="Schedule"
                                                            >
                                                                <CalendarIcon className="w-[20px] h-[20px]" />
                                                            </button>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-48 p-1 bg-zinc-900 border border-white/10 rounded-xl shadow-xl" align="start" side="top">
                                                            <button
                                                                onClick={() => setShowSchedule(true)}
                                                                className={cn(
                                                                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer",
                                                                    scheduledFor ? "text-lantern" : "text-zinc-300 hover:bg-white/8 hover:text-white"
                                                                )}
                                                            >
                                                                <CalendarIcon className="w-4 h-4 shrink-0" />
                                                                {scheduledFor ? "Change schedule" : "Schedule post"}
                                                            </button>
                                                            <button
                                                                onClick={() => setShowScheduledPosts(true)}
                                                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:bg-white/8 hover:text-white transition-colors cursor-pointer"
                                                            >
                                                                <CalendarIcon className="w-4 h-4 shrink-0" />
                                                                View scheduled
                                                            </button>
                                                        </PopoverContent>
                                                    </Popover>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {postContent.length >= 125 && (
                                                        <div className={cn("text-sm font-medium tabular-nums", postContent.length > 150 ? "text-red-500" : "text-zinc-500")}>
                                                            {postContent.length}/150
                                                        </div>
                                                    )}
                                                    <TokenLaunchTrigger
                                                        state={tokenLaunch}
                                                        onClick={() => setIsEditingTicker(true)}
                                                        className="h-9 px-2"
                                                    />
                                                    <Button
                                                        className="bg-white h-9 text-base text-black rounded-full px-5 font-extrabold disabled:opacity-50 transition-colors"
                                                        disabled={(!postContent.trim() && postImages.length === 0 && !postGif) || isPosting || postContent.length > 150}
                                                        onClick={handlePostSubmit}
                                                    >
                                                        {scheduledFor ? "Schedule" : isPosting || isTokenLaunching ? "Posting..." : "Post"}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ) : activeTab === "stream" && step === "upload" ? (
                                <motion.div
                                    key="stream"
                                    initial={{ opacity: 1, y: 0 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.125 }}
                                    className="flex flex-col items-center justify-center h-full min-h-[350px] text-zinc-500"
                                >
                                    <p>Stream configuration coming soon...</p>
                                </motion.div>
                            ) : null}
                        </AnimatePresence>
                    </div>
                </DialogContent>
            </Dialog >

            {/* Auxiliary drawers/dialogs for post tab */}
            <DraftsDrawer open={showDrafts} onClose={() => setShowDrafts(false)} />
            <ScheduleDialog
                open={showSchedule}
                onClose={() => setShowSchedule(false)}
                onConfirm={(date) => { setScheduledFor(date); setShowSchedule(false); }}
            />
            <ScheduledPostsDrawer open={showScheduledPosts} onOpenChange={setShowScheduledPosts} />

            <AlertDialog open={showCloseAlert} onOpenChange={setShowCloseAlert}>
                <AlertDialogContent className="bg-zinc-900 border-zinc-800 text-white">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Save as draft?</AlertDialogTitle>
                        <AlertDialogDescription className="text-zinc-400">
                            Your video details will be saved for later. If you discard, all changes will be lost.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => setShowCloseAlert(false)} className="bg-transparent border-zinc-700 hover:bg-zinc-800 text-white hover:text-white">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                // Discard logic
                                setStep("upload")
                                setVideoFile(null)
                                setOpen(false)
                                setShowCloseAlert(false)
                            }}
                            className="bg-red-500/10 text-red-500 hover:bg-red-500/20 border-0"
                        >
                            Discard
                        </AlertDialogAction>
                        <AlertDialogAction
                            onClick={() => {
                                // Save draft logic (mock)
                                appToast.success("Saved to drafts")
                                setOpen(false)
                                setShowCloseAlert(false)
                                // We keep the step/file state so it opens again where they left off? 
                                // USER REQUEST: "if i close this create-dialog while im in the video details section it should not open again in the video-details section."
                                // Actually user said: "if i close ... it should NOT open again in the video-details". 
                                // But usually "Save Drafts" implies it's saved somewhere else.
                                // If they "Save", we probably still reset the dialog URL/view to 'upload' for next time, but assume the data is persisted in a drafts folder.
                                setStep("upload")
                                setVideoFile(null)
                            }}
                            className="bg-white text-black hover:bg-zinc-200"
                        >
                            Save Draft
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}

