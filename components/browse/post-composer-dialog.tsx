"use client";

import { useState, useRef, useEffect } from "react";
import {
    X, Globe, Users, BadgeCheck, Medal, Crown, Check, ChevronDown,
    Image as ImageIcon, BarChart2, Plus, Trash2, Lock,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import {
    Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { GifIcon, EmojiIcon, GlobeIcon, LockIcon, MicIcon, CalendarIcon, AlertIcon } from "@/components/icons";
import { Switch } from "@/components/ui/switch";
import { EmojiPicker } from "@/components/messages/emoji-picker";
import { GifPicker } from "@/components/messages/gif-picker";
import { supabase } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/date-utils";
import { VoiceRecorder, VoiceRecorderTrigger } from "@/components/browse/voice-recorder";
import { DraftsDrawer } from "@/components/browse/drafts-drawer";
import { ScheduleDialog } from "@/components/browse/schedule-dialog";
import { ScheduledPostsDrawer } from "@/components/browse/scheduled-posts-drawer";
import { LinkPreviewCard } from "@/components/browse/link-preview-card";
import { useLinkPreview } from "@/hooks/use-link-preview";
import { TokenLaunchTrigger, TokenLaunchState, DEFAULT_TOKEN_LAUNCH } from "@/components/browse/token-launch";
import { TickerEditDialog } from "@/components/browse/ticker-edit-dialog";
import { useTokenLaunch } from "@/hooks/use-token-launch";
import { nanoid } from "nanoid"
import { PollComposer, type PollOption } from "@/components/browse/poll-composer";

interface PostRef {
    id: string;
    content: string | null;
    imageUrl: string | null;
    videoUrl?: string | null;
    createdAt: Date | string | null;
    user: {
        name: string | null;
        username: string | null;
        avatar_url: string | null;
    };
}

interface PostComposerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** comment = reply to a post, quote = quote-repost, post = standalone new post */
    mode: "comment" | "quote" | "post";
    /** Required for comment / quote modes */
    post?: PostRef;
    onSuccess?: () => void;
}

export function PostComposerDialog({ open, onOpenChange, mode, post, onSuccess }: PostComposerDialogProps) {
    const { data: session } = useAuthSession();
    const utils = trpc.useUtils();
    const { launchToken } = useTokenLaunch();
    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();

    // ── Core composer state ──────────────────────────────────────────────────
    const [content, setContent] = useState("");
    const [images, setImages] = useState<File[]>([]);
    const [gif, setGif] = useState<string | null>(null);
    const [audience, setAudience] = useState<"everyone" | "followers" | "verified" | "token_holders" | "vip">("everyone");
    const [replyPrivacy, setReplyPrivacy] = useState<"everyone" | "followers" | "verified" | "token_holders">("everyone");
    const [isSubmitting, setIsSubmitting] = useState(false);

    // ── Poll ─────────────────────────────────────────────────────────────────
    const [showPoll, setShowPoll] = useState(false);
    const [pollQuestion, setPollQuestion] = useState("");
    const [pollOptions, setPollOptions] = useState<PollOption[]>([{ id: nanoid(), text: "" }, { id: nanoid(), text: "" }]);
    const [pollEndsAt, setPollEndsAt] = useState<"1d" | "3d" | "7d">("1d");

    // ── Paywall ───────────────────────────────────────────────────────────────
    const [isPaywalled, setIsPaywalled] = useState(false);
    const [paywallPrice, setPaywallPrice] = useState<number>(0.1);

    // ── Voice ─────────────────────────────────────────────────────────────────
    const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
    const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
    const [voiceDuration, setVoiceDuration] = useState(0);

    // ── Content warning ───────────────────────────────────────────────────────
    const [hasContentWarning, setHasContentWarning] = useState(false);
    const [contentWarningText, setContentWarningText] = useState("");

    // ── Drafts / schedule ─────────────────────────────────────────────────────
    const [showDrafts, setShowDrafts] = useState(false);
    const [showSchedule, setShowSchedule] = useState(false);
    const [showScheduledPosts, setShowScheduledPosts] = useState(false);
    const [scheduledFor, setScheduledFor] = useState<Date | undefined>();
    const [dismissedPreview, setDismissedPreview] = useState(false);

    // ── Token launch ──────────────────────────────────────────────────────────
    const [tokenLaunch, setTokenLaunch] = useState<TokenLaunchState>({
        ...DEFAULT_TOKEN_LAUNCH, earningsEnabled: false,
    });
    const [isEditingTicker, setIsEditingTicker] = useState(false);

    // ── Refs ──────────────────────────────────────────────────────────────────
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);

    // ── Link preview ──────────────────────────────────────────────────────────
    const { preview: linkPreview, loading: previewLoading, clearPreview } = useLinkPreview(content);

    // Auto-generate ticker from content
    useEffect(() => {
        if (!tokenLaunch.isTickerManuallyEdited && content) {
            const auto = content.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 10);
            setTokenLaunch(prev => ({ ...prev, ticker: auto }));
        }
    }, [content, tokenLaunch.isTickerManuallyEdited]);

    // Auto-generate token name from content
    useEffect(() => {
        if (!tokenLaunch.isNameManuallyEdited) {
            const autoName = content.trim().replace(/\s+/g, " ").slice(0, 32);
            setTokenLaunch(prev => ({ ...prev, name: autoName }));
        }
    }, [content, tokenLaunch.isNameManuallyEdited]);

    // ── Mutations ─────────────────────────────────────────────────────────────
    const createPost = trpc.content.createPost.useMutation({
        onSuccess: (_, vars) => {
            toast.success(vars.status === "scheduled" ? "Post scheduled!" : "Posted!");
            utils.content.getFeed.invalidate();
            if (vars.replyToId) utils.comment.getComments.invalidate({ postId: vars.replyToId });
            reset(); onOpenChange(false); onSuccess?.();
        },
        onError: (err) => { toast.error(err.message || "Failed to post"); setIsSubmitting(false); },
    });

    const saveDraftMutation = trpc.content.createPost.useMutation({
        onSuccess: () => {
            toast.success("Draft saved");
            utils.content.getDrafts.invalidate();
            reset(); onOpenChange(false);
        },
        onError: err => toast.error(err.message || "Failed to save draft"),
    });

    // ── Helpers ───────────────────────────────────────────────────────────────
    const reset = () => {
        setContent(""); setImages([]); setGif(null); setIsSubmitting(false);
        setShowPoll(false); setPollQuestion(""); setPollOptions([{ id: nanoid(), text: "" }, { id: nanoid(), text: "" }]); setPollEndsAt("1d");
        setIsPaywalled(false); setPaywallPrice(0.1);
        setShowVoiceRecorder(false); setVoiceBlob(null); setVoiceDuration(0);
        setHasContentWarning(false); setContentWarningText("");
        setScheduledFor(undefined); setDismissedPreview(false);
        setTokenLaunch({ ...DEFAULT_TOKEN_LAUNCH, earningsEnabled: false });
        clearPreview?.();
    };

    useEffect(() => { if (!open) reset(); }, [open]);

    useEffect(() => {
        if (open) setTimeout(() => textareaRef.current?.focus(), 60);
    }, [open]);

    const handleTextareaInput = () => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
    };

    const uploadImage = async (img: File): Promise<string | undefined> => {
        const sanitized = img.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const { token, path } = await getPresignedUrl.mutateAsync({ bucket: "posts", filename: sanitized, contentType: img.type });
        const { data, error } = await supabase.storage.from("posts").uploadToSignedUrl(path, token, img);
        if (error) throw error;
        if (data) {
            const { data: pub } = supabase.storage.from("posts").getPublicUrl(data.fullPath);
            return pub.publicUrl;
        }
    };

    const handleSubmit = async () => {
        if (isSubmitting || !content.trim()) return;
        setIsSubmitting(true);

        try {
            let imageUrl: string | undefined;
            if (images.length > 0) imageUrl = await uploadImage(images[0]);
            else if (gif) imageUrl = gif;

            let voiceNoteUrl: string | undefined;
            if (voiceBlob) {
                const vf = new File([voiceBlob], `voice_${Date.now()}.webm`, { type: "audio/webm" });
                voiceNoteUrl = await uploadImage(vf);
            }

            const validPollOptions = pollOptions.filter(o => o.text.trim());
            const hasBuy = !!(tokenLaunch.buyAmount && tokenLaunch.buyAmount > 0);
            let tokenStatus: "draft" | "live" = hasBuy ? "live" : "draft";
            let tokenAddress: string | undefined;
            let poolAddress: string | undefined;

            if (tokenLaunch.ticker && (tokenLaunch.earningsEnabled || hasBuy)) {
                const result = await launchToken(
                    {
                        name: content.slice(0, 32),
                        symbol: tokenLaunch.ticker,
                        // Avatar last, matching token_image below.
                        image: imageUrl || session?.user?.avatar_url || "",
                        description: content,
                    },
                    { ...tokenLaunch, earningsEnabled: true }
                );
                if (!result.success) { setIsSubmitting(false); return; }
                if (result.status) tokenStatus = result.status as "draft" | "live";
                if (result.tokenAddress) tokenAddress = result.tokenAddress;
                if (result.poolAddress) poolAddress = result.poolAddress;
            }

            createPost.mutate({
                content,
                imageUrl,
                visibility: "public",
                audience,
                replyPrivacy,
                replyToId: mode === "comment" ? post?.id : undefined,
                repostOfId: mode === "quote" ? post?.id : undefined,
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
                scheduledFor,
                isPaywalled,
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
        } catch {
            toast.error("Failed to upload media");
            setIsSubmitting(false);
        }
    };

    const handleSaveDraft = () => {
        if (!content.trim() && images.length === 0 && !gif) return;
        saveDraftMutation.mutate({ content: content.trim() || undefined, visibility: "public", audience, replyPrivacy, status: "draft" });
    };

    const canPost = content.trim().length > 0 && content.length <= 150;
    const charCount = content.length;
    const isNearLimit = charCount >= 125;
    const isOverLimit = charCount > 150;

    if (!session?.user) return null;

    return (
        <>
            <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
                <DialogPrimitive.Portal>
                    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-white/10 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                    <DialogPrimitive.Content
                        className={cn(
                            "fixed left-1/2 top-[5vh] z-50 -translate-x-1/2",
                            "w-full max-w-[600px] max-h-[85vh] overflow-y-auto",
                            "bg-black rounded-4xl shadow-2xl outline-none border border-white/10",
                            "data-[state=open]:animate-in data-[state=closed]:animate-out",
                            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200"
                        )}
                    >
                        <DialogPrimitive.Title className="sr-only">
                            {mode === "comment" ? "Reply to post" : mode === "quote" ? "Quote post" : "Create post"}
                        </DialogPrimitive.Title>
                        {/* ── Header ── */}
                        <div className="flex items-center justify-between px-4 py-4 bg-black sticky top-0 z-10">
                            <DialogPrimitive.Close className="p-2 rounded-full hover:bg-white/10 transition-colors text-white cursor-pointer outline-none">
                                <X className="w-5 h-5 stroke-[2.5]" />
                            </DialogPrimitive.Close>
                            <div className="flex items-center gap-2 pr-2">
                                <button
                                    onClick={() => setShowDrafts(true)}
                                    className="text-[15px] font-extrabold text-twitter2 hover:text-twitter2/80 transition-colors px-4 py-1.5 rounded-full hover:bg-twitter2/10 cursor-pointer"
                                >
                                    Drafts
                                </button>
                            </div>
                        </div>


                        {/* ── Composer area ── */}
                        <div className="px-5 pb-3">
                            <div className="flex flex-col">
                                {mode === "comment" && post && (
                                    <div className="relative mb-0.5">
                                        {/* Connector line */}
                                        <div className="absolute left-[19px] top-[46px] bottom-1.5 w-0.5 bg-zinc-800 rounded-full" />

                                        <div className="flex gap-3">
                                            <Avatar className="w-10 h-10 shrink-0 border border-white/5 relative z-10">
                                                <AvatarImage src={post.user.avatar_url || ""} />
                                                <AvatarFallback>{(post.user.name?.[0] || "U")}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0 pt-0.5">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span className="font-extrabold text-white text-[15px]">{post.user.name || ""}</span>
                                                    {post.user.username && <span className="text-zinc-500 text-[15px]">@{post.user.username}</span>}
                                                    <span className="text-zinc-500 text-[15px]">·</span>
                                                    <span className="text-zinc-500 text-[15px]">{post.createdAt ? formatRelativeTime(new Date(post.createdAt).toISOString()) : "Just now"}</span>
                                                </div>
                                                <p className="text-white text-[15px] leading-normal">{post.content}</p>

                                                {post.videoUrl ? (
                                                    <div className="mt-3 rounded-2xl overflow-hidden border border-white/10 bg-zinc-900/50 aspect-video">
                                                        <video src={post.videoUrl} controls className="w-full h-full object-cover" />
                                                    </div>
                                                ) : post.imageUrl ? (
                                                    <div className="mt-3 rounded-2xl overflow-hidden border border-white/10 bg-zinc-900/50 aspect-video">
                                                        <img src={post.imageUrl} alt="" className="w-full h-full object-cover" />
                                                    </div>
                                                ) : null}

                                                <div className="mt-4 mb-5">
                                                    <span className="text-zinc-500 text-[15px]">Replying to </span>
                                                    <span className="text-twitter2 text-[15px] hover:underline cursor-pointer">@{post.user.username}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-3">
                                    <div className="flex flex-col items-center shrink-0">
                                        <Avatar className="w-10 h-10 border border-white/5 relative z-10">
                                            <AvatarImage src={session.user.avatar_url || (session.user as any).image || ""} />
                                            <AvatarFallback />
                                        </Avatar>
                                    </div>
                                    <div className="flex-1 min-w-0 pt-1">
                                        <div className="mb-2">
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
                                                    { value: "everyone", label: "Everyone", icon: <Globe className="w-5 h-5" />, bubble: "bg-bleu/15 text-bleu" },
                                                    { value: "followers", label: "Followers", icon: <Users className="w-5 h-5" />, bubble: "bg-green-500/15 text-green-500" },
                                                    { value: "verified", label: "Verified", icon: <BadgeCheck className="w-5 h-5" />, bubble: "bg-bleu/15 text-bleu" },
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
                                        </div>

                                        <textarea
                                            ref={textareaRef}
                                            placeholder={mode === "comment" ? "Post your reply" : mode === "quote" ? "Add a comment" : "What's happening?"}
                                            value={content}
                                            onChange={e => setContent(e.target.value)}
                                            onInput={handleTextareaInput}
                                            rows={mode === "post" ? 3 : 2}
                                            className="w-full bg-transparent text-[16px] sm:text-[18px] placeholder:text-zinc-500 outline-none resize-none text-white leading-normal pt-1"
                                        />

                                        {/* Image previews */}
                                        {images.length > 0 && (
                                            <div className={cn("grid gap-2 mt-3", images.length === 1 ? "grid-cols-1 max-w-sm" : "grid-cols-2")}>
                                                {images.map((img, i) => (
                                                    <div key={i} className="relative aspect-video rounded-2xl overflow-hidden border border-zinc-800 group">
                                                        <img src={URL.createObjectURL(img)} alt="" className="w-full h-full object-cover" />
                                                        <button onClick={() => setImages(images.filter((_, idx) => idx !== i))} className="absolute top-2 right-2 p-1.5 bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* GIF preview */}
                                        {gif && (
                                            <div className="relative mt-3 max-w-sm aspect-video rounded-2xl overflow-hidden border border-zinc-800 group">
                                                <img src={gif} alt="GIF" className="w-full h-full object-cover" />
                                                <button onClick={() => setGif(null)} className="absolute top-2 right-2 p-1.5 bg-black/70 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}

                                        {/* Link preview */}
                                        {!dismissedPreview && linkPreview && (
                                            <div className="mt-3 relative">
                                                <LinkPreviewCard preview={linkPreview} />
                                                <button onClick={() => setDismissedPreview(true)} className="absolute top-2 right-2 p-1 bg-black/60 hover:bg-black/80 text-white rounded-full">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
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

                                        {/* Quote post card - only in quote mode */}
                                        {mode === "quote" && post && (
                                            <div className="mt-3 border border-zinc-800 rounded-2xl overflow-hidden hover:bg-white/[0.02] transition-colors cursor-default">
                                                <div className="p-3">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <Avatar className="w-5 h-5">
                                                            <AvatarImage src={post.user.avatar_url || ""} />
                                                            <AvatarFallback>{(post.user.name?.[0] || "U")}</AvatarFallback>
                                                        </Avatar>
                                                        <span className="font-extrabold text-white text-[14px]">{post.user.name || ""}</span>
                                                        <span className="text-zinc-500 text-[14px]">@{post.user.username}</span>
                                                        <span className="text-zinc-500 text-[14px]">·</span>
                                                        <span className="text-zinc-500 text-[14px]">{post.createdAt ? formatRelativeTime(new Date(post.createdAt).toISOString()) : "Just now"}</span>
                                                    </div>
                                                    {post.content && <p className="text-zinc-300 text-[14px] leading-normal line-clamp-3">{post.content}</p>}
                                                </div>
                                                {post.videoUrl ? (
                                                    <div className="mt-3 border-t border-zinc-800 bg-zinc-900/50 aspect-video">
                                                        <video src={post.videoUrl} controls className="w-full h-full object-cover" />
                                                    </div>
                                                ) : post.imageUrl ? (
                                                    <img src={post.imageUrl} alt="" className="w-full max-h-60 object-cover border-t border-zinc-800" />
                                                ) : null}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Reply privacy + toolbar ── */}
                        <div className="px-4 pt-1 pb-3">
                            <div className="mb-2">
                                <GooDropdown
                                    side="top"
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
                                                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-bleu text-white">
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

                            {/* Poll (state existed but the dialog never rendered the
                                composer — shared PollComposer fills the gap) */}
                            {showPoll && (
                                <PollComposer
                                    className="mb-3"
                                    question={pollQuestion}
                                    onQuestionChange={setPollQuestion}
                                    options={pollOptions}
                                    onOptionsChange={setPollOptions}
                                    duration={pollEndsAt}
                                    onDurationChange={setPollEndsAt}
                                    onRemove={() => setShowPoll(false)}
                                />
                            )}

                            {/* Toolbar */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-0.5 text-pastelgray">
                                    <input type="file" multiple ref={imageInputRef} className="hidden" accept="image/*"
                                        onChange={e => { if (e.target.files?.length) setImages(prev => [...prev, ...Array.from(e.target.files!)].slice(0, 4)); }}
                                    />
                                    <button onClick={() => imageInputRef.current?.click()} className="p-2 hover:bg-white/10 cursor-pointer rounded-full transition-colors">
                                        <ImageIcon className="w-[22px] h-[22px]" />
                                    </button>
                                    <GifPicker onGifSelect={url => setGif(url)}>
                                        <button className="p-2 hover:bg-white/10 cursor-pointer rounded-full transition-colors">
                                            <GifIcon className="w-[22px] h-[22px]" />
                                        </button>
                                    </GifPicker>
                                    <EmojiPicker onEmojiSelect={emoji => setContent(prev => prev + emoji.native)}>
                                        <button className="p-2 hover:bg-white/10 cursor-pointer rounded-full transition-colors">
                                            <EmojiIcon className="w-[22px] h-[22px]" />
                                        </button>
                                    </EmojiPicker>
                                    <button onClick={() => setShowPoll(p => !p)} className={cn("p-2 cursor-pointer rounded-full transition-colors", showPoll ? "text-lantern bg-lantern/10" : "hover:bg-white/10")} title="Poll">
                                        <BarChart2 className="w-[22px] h-[22px]" />
                                    </button>
                                    <button onClick={() => setIsPaywalled(p => !p)} className={cn("p-2 cursor-pointer rounded-full transition-colors", isPaywalled ? "text-lantern bg-lantern/10" : "hover:bg-white/10")} title="Pay-per-view">
                                        <LockIcon className="w-[22px] h-[22px]" />
                                    </button>
                                    <VoiceRecorderTrigger
                                        active={showVoiceRecorder || !!voiceBlob}
                                        onClick={() => { if (voiceBlob) { setVoiceBlob(null); setVoiceDuration(0); } else setShowVoiceRecorder(v => !v); }}
                                    />
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <button className={cn("p-2 cursor-pointer rounded-full transition-colors", scheduledFor ? "text-lantern bg-lantern/10" : "hover:bg-white/10")} title="Schedule">
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
                                                    <CalendarIcon className={cn("w-[18px] h-[18px] shrink-0 transition-colors", scheduledFor ? "text-lantern" : "text-zinc-500 group-hover:text-white")} />
                                                    <span>{scheduledFor ? "Change schedule" : "Schedule post"}</span>
                                                </button>
                                                <button
                                                    onClick={() => setShowScheduledPosts(true)}
                                                    className="flex items-center gap-3 w-full px-4 py-2.5 text-[15px] font-bold text-zinc-200 hover:bg-white/5 hover:text-white rounded-full transition-all cursor-pointer text-left group"
                                                >
                                                    <CalendarIcon className="w-[18px] h-[18px] shrink-0 text-zinc-500 group-hover:text-white transition-colors" />
                                                    <span>View scheduled</span>
                                                </button>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                <div className="flex items-center gap-2">
                                    {isNearLimit && (
                                        <span className={cn("text-sm font-medium tabular-nums", isOverLimit ? "text-red-500" : "text-zinc-500")}>
                                            {charCount}/150
                                        </span>
                                    )}
                                    <TokenLaunchTrigger state={tokenLaunch} onClick={() => setIsEditingTicker(true)} className="h-11 px-2" />
                                    <button
                                        onClick={handleSubmit}
                                        disabled={!canPost || isSubmitting}
                                        className="bg-white h-11 text-base text-black hover:bg-zinc-200 rounded-full px-5 font-extrabold disabled:opacity-50 transition-colors"
                                    >
                                        {isSubmitting ? "Posting…" : scheduledFor ? "Schedule" : mode === "comment" ? "Reply" : "Post"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </DialogPrimitive.Content>
                </DialogPrimitive.Portal>
            </DialogPrimitive.Root>

            {/* ── Auxiliary dialogs/drawers (outside Radix portal to avoid z-index conflicts) ── */}
            <TickerEditDialog
                open={isEditingTicker}
                onOpenChange={setIsEditingTicker}
                state={tokenLaunch}
                onSave={updates => setTokenLaunch(prev => ({ ...prev, ...updates }))}
            />
            <DraftsDrawer open={showDrafts} onClose={() => setShowDrafts(false)} />
            <ScheduleDialog open={showSchedule} onClose={() => setShowSchedule(false)} onConfirm={date => setScheduledFor(date)} />
            <ScheduledPostsDrawer open={showScheduledPosts} onOpenChange={setShowScheduledPosts} />
        </>
    );
}
