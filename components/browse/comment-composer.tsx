"use client";

import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useAuthSession } from "@/hooks/use-auth-session";
import { GifIcon, ImageIcon, EmojiIcon, LockIcon, AlertIcon } from "@/components/icons";
import { BarChart2 } from "lucide-react";
import { PollComposer, type PollOption } from "@/components/browse/poll-composer";
import { nanoid } from "nanoid";
import { EmojiPicker } from "@/components/messages/emoji-picker";
import { GifPicker } from "@/components/messages/gif-picker";
import { useLinkPreview } from "@/hooks/use-link-preview";
import { LinkPreviewCard } from "@/components/browse/link-preview-card";
import { X } from "lucide-react";
import { TokenLaunchTrigger, TokenLaunchState, DEFAULT_TOKEN_LAUNCH } from "@/components/browse/token-launch";
import { TickerEditDialog } from "@/components/browse/ticker-edit-dialog";
import { CashtagAutocomplete, findCashtagAtCaret, caretLineOffset, type TickerHit } from "@/components/browse/cashtag-autocomplete";

// The reply box, brought up to the post composer's functionality.
//
// It was a single-line <input> and a button: text or nothing. A reply is a posts
// row like any other, so the columns for media and link previews already
// existed — comment.createComment simply never accepted them. It does now, and
// this is the UI for them.
//
// Deliberately NOT everything the post composer has. A reply inherits its
// parent's audience and visibility, so those controls are meaningless here, and
// polls / scheduling / drafts / token launch are all "start something new"
// features — a reply is a response, not a publication. What carries over is
// everything about SAYING something: text that grows, emoji, GIFs, images and
// link previews.
//
// The textarea (not an input) is also what makes $cashtag mentions possible
// later — an autocomplete popover needs a caret position inside a multi-line
// field, which a single-line input was never going to give.

const MAX_LEN = 1000;
const MAX_IMAGES = 4;

export function CommentComposer({
    postId,
    parentId,
    placeholder = "Post your reply",
    autoFocus = false,
    onPosted,
}: {
    postId: string;
    parentId?: string;
    placeholder?: string;
    autoFocus?: boolean;
    onPosted?: () => void;
}) {
    const utils = trpc.useUtils();
    const { data: session } = useAuthSession();
    const viewerAvatar =
        (session?.user as { avatar_url?: string | null; image?: string | null } | undefined)?.avatar_url ??
        session?.user?.image ??
        null;

    const [text, setText] = useState("");
    const [images, setImages] = useState<File[]>([]);
    const [gif, setGif] = useState<string | null>(null);
    const [isPosting, setIsPosting] = useState(false);

    // A reply can carry a coin, same as a post — comment.createComment takes the
    // same token surface as content.createPost.
    const [tokenLaunch, setTokenLaunch] = useState<TokenLaunchState>({
        ...DEFAULT_TOKEN_LAUNCH,
        earningsEnabled: false,
    });
    const [isEditingTicker, setIsEditingTicker] = useState(false);

    // The rest of the post composer's toolbox. Replies are posts rows, so these
    // are the same columns the post path writes.
    const [showPoll, setShowPoll] = useState(false);
    const [pollQuestion, setPollQuestion] = useState("");
    const [pollOptions, setPollOptions] = useState<PollOption[]>([{ id: nanoid(), text: "" }, { id: nanoid(), text: "" }]);
    const [pollEndsAt, setPollEndsAt] = useState<"1d" | "3d" | "7d">("1d");
    const [isPaywalled, setIsPaywalled] = useState(false);
    const [paywallPrice, setPaywallPrice] = useState(0.1);
    const [hasContentWarning, setHasContentWarning] = useState(false);
    const [contentWarningText, setContentWarningText] = useState("");

    // $cashtag mentions, same behaviour as the post composer: insert the
    // mention, touch nothing else.
    const [cashtag, setCashtag] = useState<{ query: string; start: number; end: number } | null>(null);
    const [cashtagTop, setCashtagTop] = useState(0);
    const cashtagKeyHandler = useRef<((e: React.KeyboardEvent) => boolean) | null>(null);

    const syncCashtag = (el: HTMLTextAreaElement | null) => {
        if (!el) return;
        const found = findCashtagAtCaret(el.value, el.selectionStart ?? 0);
        setCashtag(found);
        if (found) setCashtagTop(caretLineOffset(el));
    };

    const applyCashtag = (hit: TickerHit) => {
        if (!cashtag) return;
        const before = text.slice(0, cashtag.start);
        const after = text.slice(cashtag.end);
        const inserted = `$${hit.ticker.toUpperCase()}`;
        setText(`${before}${inserted} ${after}`);
        setCashtag(null);
        requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (!el) return;
            const pos = before.length + inserted.length + 1;
            el.focus();
            el.setSelectionRange(pos, pos);
        });
    };

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();
    const { preview, clearPreview } = useLinkPreview(text);

    const createComment = trpc.comment.createComment.useMutation({
        onSuccess: () => {
            utils.comment.getComments.invalidate({ postId });
            onPosted?.();
        },
        onError: (e) => toast.error(e.message || "Couldn't post your reply"),
    });

    // Grow with the content instead of scrolling inside a fixed box. Reset to
    // auto first or the height only ever ratchets upward.
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    }, [text]);

    const hasMedia = images.length > 0 || !!gif || (showPoll && pollOptions.filter((o) => o.text.trim()).length >= 2);
    const canPost = (text.trim().length > 0 || hasMedia) && text.length <= MAX_LEN && !isPosting;

    const addImages = (files: FileList | null) => {
        if (!files?.length) return;
        // Images and a GIF are mutually exclusive — one media slot per reply,
        // same as the post composer.
        setGif(null);
        setImages((prev) => [...prev, ...Array.from(files)].slice(0, MAX_IMAGES));
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canPost) return;
        setIsPosting(true);

        try {
            let imageUrl: string | undefined;
            const mediaArr: { type: "image" | "video"; url: string }[] = [];

            if (images.length > 0) {
                const uploaded = await Promise.all(
                    images.slice(0, MAX_IMAGES).map(async (img) => {
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
                        if (!data) throw new Error("Upload failed");
                        const { data: pub } = supabase.storage.from("posts").getPublicUrl(data.path);
                        return { type: "image" as const, url: pub.publicUrl };
                    }),
                );
                mediaArr.push(...uploaded);
                imageUrl = mediaArr[0]?.url;
            } else if (gif) {
                imageUrl = gif;
                mediaArr.push({ type: "image", url: gif });
            }

            await createComment.mutateAsync({
                postId,
                parentId,
                content: text.trim(),
                imageUrl,
                media: mediaArr.length > 0 ? mediaArr : undefined,
                linkPreview: preview ?? undefined,
                poll: showPoll && pollQuestion.trim() && pollOptions.filter((o) => o.text.trim()).length >= 2
                    ? {
                        question: pollQuestion.trim(),
                        options: pollOptions.filter((o) => o.text.trim()),
                        allowMultiple: false,
                        endsAt: new Date(Date.now() + ({ "1d": 1, "3d": 3, "7d": 7 }[pollEndsAt]) * 86_400_000),
                    }
                    : undefined,
                isPaywalled,
                paywallPrice: isPaywalled ? paywallPrice : undefined,
                hasContentWarning,
                contentWarningText: hasContentWarning ? contentWarningText : undefined,
                ticker: tokenLaunch.ticker || undefined,
                tokenName: tokenLaunch.name || undefined,
                creatorFeePercent: tokenLaunch.creatorFee,
                earningsEnabled: tokenLaunch.earningsEnabled,
                splits: tokenLaunch.splits,
            });

            setText("");
            setImages([]);
            setGif(null);
            clearPreview();
            setTokenLaunch({ ...DEFAULT_TOKEN_LAUNCH, earningsEnabled: false });
            setShowPoll(false);
            setPollQuestion("");
            setPollOptions([{ id: nanoid(), text: "" }, { id: nanoid(), text: "" }]);
            setIsPaywalled(false);
            setHasContentWarning(false);
            setContentWarningText("");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Couldn't post your reply");
        } finally {
            setIsPosting(false);
        }
    };

    const over = text.length > MAX_LEN;

    return (
        <form onSubmit={submit} className="flex items-start gap-2">
            <Avatar className="size-8 shrink-0">
                <AvatarImage src={viewerAvatar ?? undefined} alt="" className="object-cover" />
                <AvatarFallback />
            </Avatar>

            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="relative">
                <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={(e) => { setText(e.target.value); syncCashtag(e.target); }}
                    onClick={(e) => syncCashtag(e.currentTarget)}
                    onKeyUp={(e) => syncCashtag(e.currentTarget)}
                    onBlur={() => setCashtag(null)}
                    // Enter submits, shift+Enter is a newline — a reply is short
                    // enough that reaching for a button every time is friction.
                    onKeyDown={(e) => {
                        // The panel owns arrows/Enter/Escape while it's open, so
                        // Enter picks a ticker instead of posting the reply.
                        if (cashtag && cashtagKeyHandler.current?.(e)) { e.preventDefault(); return; }
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void submit(e as unknown as React.FormEvent);
                        }
                    }}
                    autoFocus={autoFocus}
                    rows={1}
                    placeholder={placeholder}
                    className="w-full resize-none bg-transparent text-[14px] text-zinc-200 outline-none placeholder:text-zinc-500"
                />
                {cashtag && (
                    <CashtagAutocomplete
                        top={cashtagTop}
                        query={cashtag.query}
                        onSelect={applyCashtag}
                        onClose={() => setCashtag(null)}
                        registerKeyHandler={(h) => { cashtagKeyHandler.current = h; }}
                    />
                )}
                </div>

                {images.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {images.map((img, i) => (
                            <div key={i} className="relative size-20 overflow-hidden rounded-xl bg-zinc-800">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={URL.createObjectURL(img)} alt="" className="size-full object-cover" />
                                <button
                                    type="button"
                                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                                    className="absolute right-1 top-1 grid size-5 cursor-pointer place-items-center rounded-full bg-black/70 text-white"
                                >
                                    <X className="size-3" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {gif && (
                    <div className="relative w-40 overflow-hidden rounded-xl bg-zinc-800">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={gif} alt="GIF" className="w-full object-cover" />
                        <button
                            type="button"
                            onClick={() => setGif(null)}
                            className="absolute right-1 top-1 grid size-5 cursor-pointer place-items-center rounded-full bg-black/70 text-white"
                        >
                            <X className="size-3" />
                        </button>
                    </div>
                )}

                {showPoll && (
                    <PollComposer
                        question={pollQuestion}
                        onQuestionChange={setPollQuestion}
                        options={pollOptions}
                        onOptionsChange={setPollOptions}
                        duration={pollEndsAt}
                        onDurationChange={setPollEndsAt}
                        onRemove={() => setShowPoll(false)}
                    />
                )}

                {hasContentWarning && (
                    <input
                        value={contentWarningText}
                        onChange={(e) => setContentWarningText(e.target.value)}
                        placeholder="describe the sensitive content"
                        className="w-full rounded-full border border-white/10 bg-transparent px-4 py-2 text-[13px] text-zinc-200 outline-none placeholder:text-zinc-500"
                    />
                )}

                {isPaywalled && (
                    <div className="flex items-center gap-2 text-[13px] text-zinc-400">
                        <span>Unlock price</span>
                        <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={paywallPrice}
                            onChange={(e) => setPaywallPrice(parseFloat(e.target.value) || 0)}
                            className="w-24 rounded-full border border-white/10 bg-transparent px-3 py-1 text-right tabular-nums text-zinc-200 outline-none"
                        />
                        <span>SOL</span>
                    </div>
                )}

                {preview && !hasMedia && (
                    <LinkPreviewCard preview={preview} onRemove={clearPreview} />
                )}

                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            aria-label="add an image"
                            className="grid size-8 cursor-pointer place-items-center rounded-full text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
                        >
                            <ImageIcon className="size-5" />
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            hidden
                            onChange={(e) => {
                                addImages(e.target.files);
                                e.target.value = "";
                            }}
                        />

                        <GifPicker
                            onGifSelect={(url) => {
                                setImages([]);
                                setGif(url);
                            }}
                        >
                            <span className="grid size-8 cursor-pointer place-items-center rounded-full text-zinc-400 transition-colors hover:bg-white/5 hover:text-white">
                                <GifIcon className="size-5" />
                            </span>
                        </GifPicker>

                        <EmojiPicker onEmojiSelect={(emoji) => setText((t) => t + emoji.native)}>
                            <span className="grid size-8 cursor-pointer place-items-center rounded-full text-zinc-400 transition-colors hover:bg-white/5 hover:text-white">
                                <EmojiIcon className="size-5" />
                            </span>
                        </EmojiPicker>

                        <button
                            type="button"
                            onClick={() => setShowPoll((p) => !p)}
                            title="Add poll"
                            aria-label="add poll"
                            className={cn(
                                "grid size-8 cursor-pointer place-items-center rounded-full transition-colors hover:bg-white/5",
                                showPoll ? "text-lantern" : "text-zinc-400 hover:text-white",
                            )}
                        >
                            <BarChart2 className="size-5" />
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsPaywalled((p) => !p)}
                            title="Pay-per-view"
                            aria-label="pay-per-view"
                            className={cn(
                                "grid size-8 cursor-pointer place-items-center rounded-full transition-colors hover:bg-white/5",
                                isPaywalled ? "text-lantern" : "text-zinc-400 hover:text-white",
                            )}
                        >
                            <LockIcon className="size-5" />
                        </button>

                        <button
                            type="button"
                            onClick={() => {
                                setHasContentWarning((p) => !p);
                                if (hasContentWarning) setContentWarningText("");
                            }}
                            title="Content warning"
                            aria-label="content warning"
                            className={cn(
                                "grid size-8 cursor-pointer place-items-center rounded-full transition-colors hover:bg-white/5",
                                hasContentWarning ? "text-lantern" : "text-zinc-400 hover:text-white",
                            )}
                        >
                            <AlertIcon className="size-5" />
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Only once it's worth knowing — a counter sitting at
                            0/1000 under an empty box is noise. */}
                        {text.length > MAX_LEN * 0.8 && (
                            <span className={cn("text-xs font-medium tabular-nums", over ? "text-pastelred" : "text-zinc-500")}>
                                {MAX_LEN - text.length}
                            </span>
                        )}
                        {/* Ticker pill — a reply can launch a coin too, so it
                            gets the same pill and the same edit dialog as the
                            post composer. Clearing keeps isTickerManuallyEdited
                            set for the same reason it does there. */}
                        <TokenLaunchTrigger
                            state={tokenLaunch}
                            onClick={() => setIsEditingTicker(true)}
                            className="h-11"
                            onClear={() => setTokenLaunch((prev) => ({
                                ...prev,
                                ticker: "",
                                isTickerManuallyEdited: true,
                            }))}
                        />
                        <button
                            type="submit"
                            disabled={!canPost}
                            className="h-11 shrink-0 rounded-full bg-white px-5 text-sm font-bold text-black transition-colors hover:bg-zinc-200 disabled:opacity-40"
                        >
                            {isPosting ? "Posting…" : "Reply"}
                        </button>
                    </div>
                </div>
            </div>

            <TickerEditDialog
                open={isEditingTicker}
                onOpenChange={setIsEditingTicker}
                state={tokenLaunch}
                onSave={(updates) => setTokenLaunch((prev) => ({ ...prev, ...updates }))}
            />
        </form>
    );
}
