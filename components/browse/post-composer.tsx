"use client";

import React, { useState, useRef, useEffect } from "react";
import { X, Globe, Users, BadgeCheck, Medal, Crown, Check, ChevronDown, BarChart2 } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { GifIcon, ImageIcon, EmojiIcon, GlobeIcon, LockIcon, MicIcon, CalendarIcon, AlertIcon } from "@/components/icons";
import { Switch } from "@/components/ui/switch";
import { EmojiPicker } from "@/components/messages/emoji-picker";
import { GifPicker } from "@/components/messages/gif-picker";
import { supabase } from "@/lib/supabase/client";
import { TokenLaunchTrigger, TokenLaunchState, DEFAULT_TOKEN_LAUNCH } from "@/components/browse/token-launch";
import { TickerEditDialog } from "@/components/browse/ticker-edit-dialog";
import { useTokenLaunch } from "@/hooks/use-token-launch";
import { DraftsDrawer } from "@/components/browse/drafts-drawer";
import { ScheduleDialog } from "@/components/browse/schedule-dialog";
import { useLinkPreview } from "@/hooks/use-link-preview";
import { LinkPreviewCard } from "@/components/browse/link-preview-card";
import { VoiceRecorder, VoiceRecorderTrigger } from "@/components/browse/voice-recorder";
import { ScheduledPostsDrawer } from "@/components/browse/scheduled-posts-drawer";
import { nanoid } from "nanoid";
import { PollComposer, type PollOption } from "@/components/browse/poll-composer";

export function PostComposer() {
    const [content, setContent] = useState("");
    const [images, setImages] = useState<File[]>([]);
    const [gif, setGif] = useState<string | null>(null);
    const [isMounted, setIsMounted] = useState(false);
    const [focused, setFocused] = useState(false);
    const [audience, setAudience] = useState<"everyone" | "followers" | "verified" | "token_holders" | "vip">("everyone");
    const [replyPrivacy, setReplyPrivacy] = useState<"everyone" | "followers" | "verified" | "token_holders">("everyone");
    const [tokenLaunch, setTokenLaunch] = useState<TokenLaunchState>({
        ...DEFAULT_TOKEN_LAUNCH,
        earningsEnabled: false,
    });
    const [isEditingTicker, setIsEditingTicker] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showDrafts, setShowDrafts] = useState(false);
    const [showSchedule, setShowSchedule] = useState(false);
    const [showScheduledPosts, setShowScheduledPosts] = useState(false);
    const [scheduledFor, setScheduledFor] = useState<Date | undefined>();
    // Poll
    const [showPoll, setShowPoll] = useState(false);
    const [pollQuestion, setPollQuestion] = useState("");
    const [pollOptions, setPollOptions] = useState<PollOption[]>([{ id: nanoid(), text: "" }, { id: nanoid(), text: "" }]);
    const [pollEndsAt, setPollEndsAt] = useState<"1d" | "3d" | "7d">("1d");
    // PPV
    const [isPaywalled, setIsPaywalled] = useState(false);
    const [paywallPrice, setPaywallPrice] = useState<number>(0.1); // SOL
    // Link preview (auto-detected from content)
    const { preview: linkPreview, loading: previewLoading, clearPreview } = useLinkPreview(content);
    const [dismissedPreview, setDismissedPreview] = useState(false);
    // Voice note
    const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
    const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
    const [voiceDuration, setVoiceDuration] = useState(0);
    // Content warning
    const [hasContentWarning, setHasContentWarning] = useState(false);
    const [contentWarningText, setContentWarningText] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const composerRef = useRef<HTMLDivElement>(null);
    const { data: session } = useAuthSession();

    useEffect(() => {
        if (tokenLaunch.isTickerManuallyEdited) return;
        const autoTicker = content
            .replace(/[^a-zA-Z0-9]/g, "")
            .toUpperCase()
            .slice(0, 10);
        setTokenLaunch((prev) => ({ ...prev, ticker: autoTicker }));
    }, [content, tokenLaunch.isTickerManuallyEdited]);

    useEffect(() => {
        if (tokenLaunch.isNameManuallyEdited) return;
        const autoName = content.trim().replace(/\s+/g, " ").slice(0, 32);
        setTokenLaunch((prev) => ({ ...prev, name: autoName }));
    }, [content, tokenLaunch.isNameManuallyEdited]);

    useEffect(() => {
        setIsMounted(true);
        const handleClickOutside = (e: MouseEvent) => {
            if (composerRef.current && !composerRef.current.contains(e.target as Node)) {
                setFocused(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const utils = trpc.useUtils();
    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();
    const { launchToken } = useTokenLaunch();

    const saveDraftMutation = trpc.content.createPost.useMutation({
        onSuccess: () => {
            setContent("");
            setImages([]);
            setGif(null);
            setScheduledFor(undefined);
            toast.success("Draft saved");
            utils.content.getDrafts.invalidate();
        },
        onError: err => toast.error(err.message || "Failed to save draft"),
    });

    const handleSaveDraft = () => {
        if (!content.trim() && images.length === 0 && !gif) return;
        saveDraftMutation.mutate({
            content: content.trim() || undefined,
            visibility: "public",
            audience,
            replyPrivacy,
            status: "draft",
        });
    };

    const createPost = trpc.content.createPost.useMutation({
        onSuccess: (_, vars) => {
            setContent("");
            setImages([]);
            setGif(null);
            setScheduledFor(undefined);
            setShowPoll(false);
            setPollQuestion("");
            setPollOptions([{ id: nanoid(), text: "" }, { id: nanoid(), text: "" }]);
            setIsPaywalled(false);
            setDismissedPreview(false);
            setVoiceBlob(null);
            setVoiceDuration(0);
            setShowVoiceRecorder(false);
            setTokenLaunch({ ...DEFAULT_TOKEN_LAUNCH, earningsEnabled: false });
            setIsSubmitting(false);
            toast.success(vars.status === "scheduled" ? "Post scheduled!" : "Banger posted!");

            // Optimistically prepend to feed before invalidation finishes
            if (vars.status === "published") {
                const newPost = {
                    ..._,
                    id: _.postId,
                    createdAt: new Date().toISOString(),
                    user: session.user,
                    isLiked: false,
                    isBookmarked: false,
                    likes: 0,
                    reposts: 0,
                    comments: 0,
                    views: 0
                };

                utils.content.getFeed.setInfiniteData({ type: "for-you", limit: 20 }, (old: any) => {
                    if (!old) return old;
                    return {
                        ...old,
                        pages: old.pages.map((page: any, i: number) =>
                            i === 0 ? { ...page, posts: [newPost, ...page.posts] } : page
                        )
                    };
                });

                utils.content.getFeed.setInfiniteData({ type: "following", limit: 20 }, (old: any) => {
                    if (!old) return old;
                    return {
                        ...old,
                        pages: old.pages.map((page: any, i: number) =>
                            i === 0 ? { ...page, posts: [newPost, ...page.posts] } : page
                        )
                    };
                });
            }

            utils.content.getFeed.invalidate();
        },
        onError: (err) => {
            setIsSubmitting(false);
            toast.error(err.message || "Failed to post");
        },
    });

    const handlePost = async () => {
        if (isSubmitting) return;
        if (!content.trim() && images.length === 0 && !gif) return;
        if (content.length > 150) {
            toast.error("Posts are limited to 150 characters.");
            return;
        }
        setIsSubmitting(true);

        const hasBuy = !!(tokenLaunch.buyAmount && tokenLaunch.buyAmount > 0);
        let imageUrl: string | undefined;
        let generatedOgUrl: string | undefined;
        let mediaArr: { type: "image" | "video"; url: string }[] = [];

        try {
            if (images.length > 0) {
                const uploadPromises = images.slice(0, 4).map(async (img) => {
                    const sanitizedFileName = img.name.replace(/[^a-zA-Z0-9.-]/g, "_");
                    const { token, path } = await getPresignedUrl.mutateAsync({
                        bucket: "posts",
                        filename: sanitizedFileName,
                        contentType: img.type,
                    });
                    const { data, error } = await supabase.storage
                        .from("posts")
                        .uploadToSignedUrl(path, token, img);

                    if (error) throw error;
                    if (data) {
                        const { data: pub } = supabase.storage.from("posts").getPublicUrl(data.path);
                        return { type: "image" as const, url: pub.publicUrl };
                    }
                    throw new Error("Upload failed");
                });

                const uploadedMedia = await Promise.all(uploadPromises);
                mediaArr = [...mediaArr, ...uploadedMedia];
                if (mediaArr.length > 0) imageUrl = mediaArr[0].url;
            } else if (gif) {
                imageUrl = gif;
                mediaArr.push({ type: "image", url: gif });
            } else if (tokenLaunch.ticker && (tokenLaunch.earningsEnabled || hasBuy)) {
                // Generate and upload a physical snapshot for the token launch.
                // We save this URL to the dedicated 'token' column instead of 'imageUrl'
                // so it stays hidden from the main feed but works for metadata.
                const generatedImageUrl = `${window.location.origin}/api/og/post?text=${encodeURIComponent(content.slice(0, 150))}&name=${encodeURIComponent(session?.user?.name || "User")}&username=${encodeURIComponent(session?.user?.username || "")}&avatar=${encodeURIComponent(session?.user?.avatar_url || "")}`;
                const response = await fetch(generatedImageUrl);
                const blob = await response.blob();
                const file = new File([blob], `generated_post_${Date.now()}.png`, { type: "image/png" });
                const { token: uploadToken, path } = await getPresignedUrl.mutateAsync({
                    bucket: "posts",
                    filename: file.name,
                    contentType: file.type,
                });
                const { data, error } = await supabase.storage
                    .from("posts")
                    .uploadToSignedUrl(path, uploadToken, file);
                if (error) throw error;
                if (data) {
                    // Use path instead of fullPath to avoid double-bucket prefixing
                    const { data: pub } = supabase.storage.from("posts").getPublicUrl(data.path);
                    generatedOgUrl = pub.publicUrl;
                }
            }
        } catch (err) {
            toast.error("Failed to upload image");
            setIsSubmitting(false);
            return;
        }

        // Upload voice note if present
        let voiceNoteUrl: string | undefined;
        if (voiceBlob) {
            try {
                const voiceFile = new File([voiceBlob], `voice_${Date.now()}.webm`, { type: "audio/webm" });
                const { token, path } = await getPresignedUrl.mutateAsync({
                    bucket: "posts",
                    filename: voiceFile.name,
                    contentType: voiceFile.type,
                });
                const { data: voiceData, error: voiceError } = await supabase.storage
                    .from("posts")
                    .uploadToSignedUrl(path, token, voiceFile);
                if (voiceError) throw voiceError;
                if (voiceData) {
                    const { data: voicePub } = supabase.storage.from("posts").getPublicUrl(voiceData.path);
                    voiceNoteUrl = voicePub.publicUrl;
                }
            } catch {
                toast.error("Failed to upload voice note");
                setIsSubmitting(false);
                return;
            }
        }
        let tokenStatus: "draft" | "live" = hasBuy ? "live" : "draft";
        let tokenAddress: string | undefined;
        let poolAddress: string | undefined;

        console.log("[handlePost] tokenLaunch state:", {
            earningsEnabled: tokenLaunch.earningsEnabled,
            ticker: tokenLaunch.ticker,
            buyAmount: tokenLaunch.buyAmount,
            hasBuy,
        });

        if (tokenLaunch.ticker && (tokenLaunch.earningsEnabled || hasBuy)) {
            const launchResult = await launchToken(
                {
                    name: content.slice(0, 32),
                    symbol: tokenLaunch.ticker,
                    image: imageUrl || generatedOgUrl || "",
                    description: content,
                },
                { ...tokenLaunch, earningsEnabled: true }
            );

            console.log("[handlePost] launchResult:", launchResult);

            if (!launchResult.success) {
                setIsSubmitting(false);
                return;
            }

            if (launchResult.status) tokenStatus = launchResult.status as "draft" | "live";
            if (launchResult.tokenAddress) tokenAddress = launchResult.tokenAddress;
            if (launchResult.poolAddress) poolAddress = launchResult.poolAddress;
        }

        const validPollOptions = pollOptions.filter(o => o.text.trim());
        createPost.mutate({
            content,
            imageUrl,
            media: mediaArr.length > 0 ? mediaArr : undefined,
            visibility: "public",
            audience,
            replyPrivacy,
            ticker: tokenLaunch.ticker || undefined,
            tokenName: tokenLaunch.name || undefined,
            token_image: imageUrl?.split(',')[0] || session?.user?.avatar_url || session?.user?.image || undefined,
            twitterUrl: tokenLaunch.twitterUrl || undefined,
            telegramUrl: tokenLaunch.telegramUrl || undefined,
            websiteUrl: tokenLaunch.websiteUrl || undefined,
            earningsEnabled: tokenLaunch.earningsEnabled || hasBuy,
            tokenStatus,
            tokenAddress,
            poolAddress,
            creatorFeePercent: tokenLaunch.creatorFee,
            splits: tokenLaunch.splits.length > 0 ? tokenLaunch.splits : undefined,
            status: scheduledFor ? "scheduled" : "published",
            scheduledFor: scheduledFor,
            isPaywalled: isPaywalled,
            paywallPrice: isPaywalled ? Math.round(paywallPrice * 1_000_000_000) : undefined,
            linkPreview: (!dismissedPreview && linkPreview) ? linkPreview : undefined,
            hasContentWarning: hasContentWarning || undefined,
            contentWarningText: hasContentWarning ? contentWarningText || undefined : undefined,
            poll: showPoll && pollQuestion.trim() && validPollOptions.length >= 2 ? {
                question: pollQuestion.trim(),
                options: validPollOptions.map(o => ({ id: o.id, text: o.text.trim(), imageUrl: o.imageUrl })),
                allowMultiple: false,
                endsAt: new Date(Date.now() + ({ "1d": 86400000, "3d": 259200000, "7d": 604800000 }[pollEndsAt])),
            } : undefined,
        });
    };

    const handleTextareaInput = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
    };

    const isPosting = isSubmitting || createPost.isPending;

    if (!isMounted || !session?.user) return null;

    return (
        <div
            ref={composerRef}
            className="p-4 z-5 border-b border-soft-gray/[0.12] flex gap-4 cursor-text bg-background"
            onClick={(e) => {
                const tag = (e.target as HTMLElement).tagName;
                if (tag !== "BUTTON" && tag !== "INPUT" && tag !== "TEXTAREA" && !(e.target as HTMLElement).closest("button")) {
                    textareaRef.current?.focus();
                }
            }}
        >
            <Avatar className="w-10 h-10 shrink-0 border border-white/10">
                <AvatarImage src={session?.user?.avatar_url || session?.user?.image || ""} />
                <AvatarFallback></AvatarFallback>
            </Avatar>

            <div className="flex-1 flex flex-col">
                {focused && (
                    <div className="flex items-center justify-between mb-2">
                        <GooDropdown
                            align="start"
                            width={320}
                            gap={8}
                            itemHeight={60}
                            headerHeight={52}
                            header={
                                <div className="flex h-full flex-col justify-center border-b border-white/5 px-4">
                                    <h3 className="font-bold text-white text-[15px]">Choose audience</h3>
                                </div>
                            }
                            triggerClassName="flex items-center gap-1.5 px-3 py-1 rounded-full cursor-pointer text-twitter2 text-sm font-medium border border-flexwhite/15 hover:bg-white/10 transition-colors w-fit"
                            trigger={
                                <>
                                    {audience === "everyone" && "Everyone"}
                                    {audience === "followers" && "Followers"}
                                    {audience === "verified" && "Verified"}
                                    {audience === "token_holders" && "Token Holders"}
                                    {audience === "vip" && "VIP Only"}
                                    <ChevronDown className="w-4 h-4" />
                                </>
                            }
                            items={([
                                { value: "everyone", label: "Everyone", icon: <Globe className="w-5 h-5" />, bubble: "bg-blue-500/15 text-blue-500" },
                                { value: "followers", label: "Followers", icon: <Users className="w-5 h-5" />, bubble: "bg-green-500/15 text-green-500" },
                                { value: "verified", label: "Verified", icon: <BadgeCheck className="w-5 h-5" />, bubble: "bg-blue-500/15 text-blue-500" },
                                { value: "token_holders", label: "Token Holders", icon: <Medal className="w-5 h-5" />, bubble: "bg-yellow-500/15 text-yellow-500" },
                                { value: "vip", label: "VIP Only", icon: <Crown className="w-5 h-5" />, bubble: "bg-amber-500/15 text-amber-400" },
                            ] as const).map((opt) => ({
                                key: opt.value,
                                onClick: () => setAudience(opt.value),
                                className: "justify-between px-4 cursor-pointer hover:bg-white/5",
                                label: (
                                    <>
                                        <span className="flex items-center gap-3">
                                            <span className={cn("flex h-10 w-10 items-center justify-center rounded-full", opt.bubble)}>
                                                {opt.icon}
                                            </span>
                                            <span className="font-bold text-white text-[15px]">{opt.label}</span>
                                        </span>
                                        {audience === opt.value && <Check className="w-5 h-5 text-twitter2" />}
                                    </>
                                ),
                            }))}
                        />
                        <div className="flex items-center gap-1">
                            {(content.trim() || images.length > 0 || !!gif) && (
                                <button
                                    onClick={handleSaveDraft}
                                    disabled={saveDraftMutation.isPending}
                                    className="px-3 py-1 rounded-full text-xs font-black text-twitter2 hover:text-zinc-100 hover:bg-white/10 transition-colors disabled:opacity-40"
                                >
                                    Save draft
                                </button>
                            )}
                            <button
                                onClick={() => setShowDrafts(true)}
                                className="px-3 py-1 rounded-full text-xs font-black cursor-pointer text-twitter2 hover:text-zinc-100 hover:bg-white/10 transition-colors"
                            >
                                Drafts
                            </button>
                        </div>
                    </div>
                )}

                <textarea
                    ref={textareaRef}
                    placeholder="What's happening?"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    onInput={handleTextareaInput}
                    onFocus={() => setFocused(true)}
                    rows={1}
                    className="w-full bg-transparent text-2xl placeholder:text-zinc-400/85 outline-none resize-none mb-5"
                />

                {images.length > 0 && (
                    <div className={cn("grid gap-2 mt-3", images.length === 1 ? "grid-cols-1 max-w-[280px]" : "grid-cols-2 max-w-md")}>
                        {images.map((img, i) => (
                            <div key={i} className="relative aspect-video rounded-xl overflow-hidden border border-zinc-800 group">
                                <img src={URL.createObjectURL(img)} alt="" className="w-full h-full object-cover" />
                                <button
                                    onClick={() => {
                                        const next = images.filter((_, idx) => idx !== i);
                                        setImages(next);
                                        if (next.length === 0 && !gif) { setHasContentWarning(false); setContentWarningText(""); }
                                    }}
                                    className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {gif && (
                    <div className="relative mt-3 max-w-[280px] aspect-video rounded-xl overflow-hidden border border-zinc-800 group">
                        <img src={gif} alt="GIF" className="w-full h-full object-cover" />
                        <button
                            onClick={() => { setGif(null); if (images.length === 0) { setHasContentWarning(false); setContentWarningText(""); } }}
                            className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Link preview (auto-detected) */}
                {!dismissedPreview && linkPreview && (
                    <div className="mt-3 relative">
                        <LinkPreviewCard preview={linkPreview} />
                        <button
                            onClick={() => setDismissedPreview(true)}
                            className="absolute top-2 right-2 p-1 bg-black/60 hover:bg-black/80 text-white rounded-full"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
                {previewLoading && (
                    <div className="mt-2 text-xs text-zinc-500 animate-pulse">Fetching link preview…</div>
                )}

                {/* Content Warning Toggle Pill - Only when media is present */}
                {(images.length > 0 || !!gif) && (
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

                {/* PPV toggle */}
                {isPaywalled && (
                    <div className="mt-3 flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 border border-white/10">
                        <LockIcon className="w-4 h-4 text-lantern shrink-0" />
                        <div className="flex-1 flex items-center gap-2">
                            <span className="text-sm text-zinc-300">Price:</span>
                            <input
                                type="number"
                                min="0.001"
                                step="0.001"
                                value={paywallPrice}
                                onChange={e => setPaywallPrice(Number(e.target.value))}
                                className="w-20 bg-transparent border-b border-white/20 text-sm text-zinc-100 outline-none text-center"
                            />
                            <span className="text-sm text-zinc-400">SOL</span>
                        </div>
                        <button onClick={() => setIsPaywalled(false)} className="text-zinc-500 hover:text-zinc-300">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Poll creator */}
                {showPoll && (
                    <PollComposer
                        className="mt-3"
                        question={pollQuestion}
                        onQuestionChange={setPollQuestion}
                        options={pollOptions}
                        onOptionsChange={setPollOptions}
                        duration={pollEndsAt}
                        onDurationChange={setPollEndsAt}
                        onRemove={() => setShowPoll(false)}
                    />
                )}

                {/* Voice recorder */}
                {showVoiceRecorder && (
                    <div className="mt-3">
                        <VoiceRecorder
                            onAudioReady={(blob, dur) => {
                                setVoiceBlob(blob);
                                setVoiceDuration(dur);
                                setShowVoiceRecorder(false);
                            }}
                            onCancel={() => {
                                setVoiceBlob(null);
                                setVoiceDuration(0);
                                setShowVoiceRecorder(false);
                            }}
                        />
                    </div>
                )}
                {voiceBlob && !showVoiceRecorder && (
                    <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900/60 border border-white/10">
                        <MicIcon className="w-4 h-4 text-lantern shrink-0" />
                        <span className="text-sm text-zinc-300">Voice note ({Math.floor(voiceDuration / 60)}:{String(voiceDuration % 60).padStart(2, "0")})</span>
                        <button
                            onClick={() => { setVoiceBlob(null); setVoiceDuration(0); }}
                            className="ml-auto text-zinc-500 hover:text-zinc-300"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {focused && (
                    <div className="pt-2 pb-1">
                        <GooDropdown
                            align="start"
                            width={320}
                            gap={8}
                            itemHeight={60}
                            headerHeight={72}
                            header={
                                <div className="flex h-full flex-col justify-center gap-0.5 border-b border-white/5 px-4">
                                    <h3 className="font-bold text-white text-[15px]">Who can reply?</h3>
                                    <p className="text-postgray text-xs">Choose who can reply to this post.<br />Anyone mentioned can always reply.</p>
                                </div>
                            }
                            triggerClassName="flex cursor-pointer items-center gap-2 text-twitter2 hover:bg-white/10 px-2 py-1.5 rounded-full transition-colors text-sm font-medium"
                            trigger={
                                <>
                                    {replyPrivacy === "everyone" && <><GlobeIcon className="w-5 h-5" /> Everyone can reply</>}
                                    {replyPrivacy === "followers" && <><Users className="w-5 h-5" /> Followers can reply</>}
                                    {replyPrivacy === "verified" && <><BadgeCheck className="w-5 h-5" /> Verified can reply</>}
                                    {replyPrivacy === "token_holders" && <><Medal className="w-5 h-5" /> Token Holders can reply</>}
                                </>
                            }
                            items={([
                                { value: "everyone", label: "Everyone", icon: <Globe className="w-5 h-5" /> },
                                { value: "followers", label: "Accounts you follow", icon: <Users className="w-5 h-5" /> },
                                { value: "verified", label: "Verified accounts", icon: <BadgeCheck className="w-5 h-5" /> },
                                { value: "token_holders", label: "Token Holders", icon: <Medal className="w-5 h-5" /> },
                            ] as const).map((opt) => ({
                                key: opt.value,
                                onClick: () => setReplyPrivacy(opt.value),
                                className: "justify-between px-4 cursor-pointer hover:bg-white/5",
                                label: (
                                    <>
                                        <span className="flex items-center gap-3">
                                            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white">
                                                {opt.icon}
                                            </span>
                                            <span className="font-bold text-white text-[15px]">{opt.label}</span>
                                        </span>
                                        {replyPrivacy === opt.value && <Check className="w-5 h-5 text-twitter2" />}
                                    </>
                                ),
                            }))}
                        />
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-0.5 text-pastelgray">
                        <input
                            type="file"
                            multiple
                            ref={imageInputRef}
                            className="hidden"
                            accept="image/*"
                            onChange={(e) => {
                                if (e.target.files?.length) {
                                    setImages((prev) => [...prev, ...Array.from(e.target.files!)].slice(0, 4));
                                }
                            }}
                        />
                        <button onClick={() => imageInputRef.current?.click()} className="p-2 hover:bg-white/10 cursor-pointer rounded-full transition-colors">
                            <ImageIcon className="w-[22px] h-[22px]" />
                        </button>
                        <GifPicker onGifSelect={(url) => setGif(url)}>
                            <button className="p-2 hover:bg-white/10 cursor-pointer rounded-full transition-colors">
                                <GifIcon className="w-[22px] h-[22px]" />
                            </button>
                        </GifPicker>
                        <EmojiPicker onEmojiSelect={(emoji) => setContent((prev) => prev + emoji.native)}>
                            <button className="p-2 hover:bg-white/10 cursor-pointer rounded-full transition-colors">
                                <EmojiIcon className="w-[22px] h-[22px]" />
                            </button>
                        </EmojiPicker>
                        <button
                            onClick={() => { setShowPoll(p => !p); }}
                            className={cn("p-2 cursor-pointer rounded-full transition-colors", showPoll ? "text-lantern bg-lantern/10" : "hover:bg-white/10")}
                            title="Add poll"
                        >
                            <BarChart2 className="w-[22px] h-[22px]" />
                        </button>
                        <button
                            onClick={() => setIsPaywalled(p => !p)}
                            className={cn("p-2 cursor-pointer rounded-full transition-colors", isPaywalled ? "text-lantern bg-lantern/10" : "hover:bg-white/10")}
                            title="Pay-per-view"
                        >
                            <LockIcon className="w-[22px] h-[22px]" />
                        </button>
                        <VoiceRecorderTrigger
                            active={showVoiceRecorder || !!voiceBlob}
                            onClick={() => {
                                if (voiceBlob) { setVoiceBlob(null); setVoiceDuration(0); }
                                else setShowVoiceRecorder(v => !v);
                            }}
                        />
                        <Popover>
                            <PopoverTrigger asChild>
                                <button
                                    className={cn(
                                        "p-2 cursor-pointer rounded-full transition-colors",
                                        scheduledFor ? "text-lantern bg-lantern/10 hover:bg-lantern/20" : "text- hover:text-twitter hover:bg-white/10"
                                    )}
                                    title="Schedule"
                                >
                                    <CalendarIcon className="w-[20px] h-[20px]" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent
                                className="w-52 bg-neutral-950 border-flexborder/75 rounded-3xl shadow-[0_0_15px_5px_rgba(255,255,255,0.1)] ring ring-white/10 p-1.5 overflow-hidden z-50"
                                align="start"
                                side="top"
                                sideOffset={8}
                            >
                                <div className="flex flex-col gap-0.5">
                                    <button
                                        onClick={() => setShowSchedule(true)}
                                        className={cn(
                                            "flex items-center gap-3 w-full px-4 py-2.5 text-[15px] font-bold transition-all rounded-full cursor-pointer text-left group",
                                            scheduledFor ? "text-lantern hover:bg-lantern/10" : "text-zinc-200 hover:bg-white/5 hover:text-white"
                                        )}
                                    >
                                        <CalendarIcon className={cn("w-[20px] text-pastelgray h-[20px] shrink-0 transition-colors", scheduledFor ? "text-lantern" : "text-zinc-500 group-hover:text-white")} />
                                        <span>{scheduledFor ? "Change schedule" : "Schedule post"}</span>
                                    </button>
                                    <button
                                        onClick={() => setShowScheduledPosts(true)}
                                        className="flex items-center gap-3 w-full px-4 py-2.5 text-[15px] font-bold text-zinc-200 hover:bg-white/5 hover:text-white rounded-full transition-all cursor-pointer text-left group"
                                    >
                                        <CalendarIcon className="w-[20px] h-[20px] shrink-0 text-pastelgray group-hover:text-white transition-colors" />
                                        <span>View scheduled</span>
                                    </button>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="flex items-center gap-2">
                        {content.length >= 125 && (
                            <span className={cn("text-sm font-medium", content.length > 150 ? "text-red-500" : "text-zinc-500")}>
                                {content.length}/150
                            </span>
                        )}
                        <TokenLaunchTrigger
                            state={tokenLaunch}
                            onClick={() => setIsEditingTicker(true)}
                            className="h-11 px-2"
                        />
                        <Button
                            onClick={handlePost}
                            disabled={(!content.trim() && images.length === 0 && !gif) || isPosting || content.length > 150}
                            className="bg-white h-11 text-base text-black hover:bg-zinc-200 rounded-full px-5 font-extrabold disabled:opacity-50"
                        >
                            {isPosting ? "Posting..." : scheduledFor ? "Schedule" : "Post"}
                        </Button>
                    </div>
                </div>

                <TickerEditDialog
                    open={isEditingTicker}
                    onOpenChange={setIsEditingTicker}
                    state={tokenLaunch}
                    onSave={(updates) => setTokenLaunch((prev) => ({ ...prev, ...updates }))}
                />
                <DraftsDrawer open={showDrafts} onClose={() => setShowDrafts(false)} />
                <ScheduleDialog
                    open={showSchedule}
                    onClose={() => setShowSchedule(false)}
                    onConfirm={date => setScheduledFor(date)}
                />
                <ScheduledPostsDrawer open={showScheduledPosts} onOpenChange={setShowScheduledPosts} />
            </div>
        </div>
    );
}
