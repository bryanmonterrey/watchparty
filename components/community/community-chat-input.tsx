"use client";

import { useEffect, useRef, useState } from "react";
import { useComposerDraft } from "@/hooks/use-composer-drafts";
import { useComposerKeys } from "@/hooks/use-composer-keys";
import { trpc } from "@/lib/trpc/client";
import { HugeiconsIcon } from "@hugeicons/react";
import { StickerIcon } from "@hugeicons/core-free-icons";
import { useCommunityReply } from "@/hooks/use-community-reply";
import { useCommunitySend } from "@/hooks/use-community-send";
import { findLastOwnMessageId, useEditRequest } from "@/lib/community/edit-request";
import { ComposerReplyBanner } from "@/components/ui/composer-reply-banner";
import { COMMUNITY_PAGE_LIMIT } from "@/hooks/use-community-reaction";
import { ArrowUpIcon, CreateIcon, LockIcon } from "../icons";

/**
 * Shared geometry for the composer's controls.
 *
 * The row is `items-end` on purpose: as the textarea grows the controls should
 * stay with the LAST line, the way every chat app does it. On a single line
 * that alone reads as bottom-aligned rather than centred, because a 32px button
 * sits flush against the bottom of a 52px row (py-3.5 + leading-6) — 20px of
 * space above it and none below.
 *
 * `mb-2.5` fixes it for EVERY height rather than just the one-line case. The
 * row is 28 + 24n tall for n lines and the last line's centre sits at 24n + 2;
 * a bottom-anchored 32px button lifted 10px centres at (28 + 24n) − 10 − 16 =
 * 24n + 2. The same number, so the controls track the caret's line exactly.
 *
 * Switching the row to `items-center` would centre them against the whole box
 * instead, which drifts further off the caret with every new line.
 */
const COMPOSER_CONTROL = "mb-2.5 h-8 w-8 shrink-0 flex items-center justify-center rounded-full";

type Mentionable = { username: string; name: string | null };
type Sticker = { id: string; name: string; imageUrl: string };

type Props = {
    channelId: string;
    channelName: string;
    onTyping?: () => void;
    onStopTyping?: () => void;
    /** server members for @autocomplete */
    mentionables?: Mentionable[];
    /** server stickers for the picker */
    stickers?: Sticker[];
    /** read-only channel + guest role → show the locked bar instead of the input */
    locked?: boolean;
    /** Identity the optimistic row renders with, before the server confirms. */
    author?: {
        userId: string;
        userName: string;
        userImage: string | null;
        memberRole: string;
        roleColor?: string | null;
    } | null;
};

/** Grows with the text, then scrolls. ~6 lines before it stops growing. */
const MAX_COMPOSER_HEIGHT = 160;

export function CommunityChatInput({ channelId, channelName, onTyping, onStopTyping, mentionables = [], stickers = [], locked = false, author = null }: Props) {
    // Draft is the source of truth for the text, so switching channels
    // mid-sentence keeps what you were writing.
    const { value: content, setValue: setContent, clear: clearDraft } = useComposerDraft(channelId);
    const [stickersOpen, setStickersOpen] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    // @autocomplete: the token being typed after the last "@" (null = closed)
    const [mentionQuery, setMentionQuery] = useState<string | null>(null);
    const mentionMatches = mentionQuery !== null
        ? mentionables.filter((m) =>
            m.username.toLowerCase().startsWith(mentionQuery.toLowerCase()) ||
            (m.name ?? "").toLowerCase().startsWith(mentionQuery.toLowerCase()),
        ).slice(0, 5)
        : [];

    const insertMention = (username: string) => {
        setContent(content.replace(/@[a-zA-Z0-9_-]*$/, `@${username} `));
        setMentionQuery(null);
        inputRef.current?.focus();
    };
    const utils = trpc.useUtils();
    const requestEdit = useEditRequest((s) => s.requestEdit);
    const lastTypingRef = useRef(0);
    const { replyTo, setReplyTo } = useCommunityReply();

    // Switching channels drops a stale reply target.
    useEffect(() => {
        setReplyTo(null);
    }, [channelId, setReplyTo]);

    // Optimistic + stable-keyed. `author` is what the optimistic row renders
    // as; without it we skip the optimistic insert rather than paint a message
    // with the wrong name on it.
    const sendMessage = useCommunitySend(channelId, author ?? null);
    useEffect(() => {
        if (!sendMessage.isSuccess) return;
        clearDraft();
        setReplyTo(null);
        onStopTyping?.();
        lastTypingRef.current = 0;
    }, [sendMessage.isSuccess, clearDraft, setReplyTo, onStopTyping]);

    const onChange = (value: string) => {
        setContent(value);
        // open/refresh the mention popover while typing an @token at the end
        const m = value.match(/@([a-zA-Z0-9_-]*)$/);
        setMentionQuery(m ? m[1] : null);
        if (!value.trim()) {
            onStopTyping?.();
            lastTypingRef.current = 0;
            return;
        }
        // Throttle typing broadcasts to at most one every 2s.
        const now = Date.now();
        if (now - lastTypingRef.current > 2000) {
            lastTypingRef.current = now;
            onTyping?.();
        }
    };

    const submit = () => {
        if (!content.trim() || sendMessage.isPending) return false;
        sendMessage.mutate({ channelId, content, replyToId: replyTo?.id });
        return true;
    };

    const onSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        submit();
    };

    const onKeyDown = useComposerKeys({
        onSubmit: submit,
        getValue: () => content,
        isAutocompleteOpen: () => mentionQuery !== null && mentionMatches.length > 0,
        onAcceptAutocomplete: () => insertMention(mentionMatches[0].username),
        onCloseAutocomplete: () => setMentionQuery(null),
        onCancelReply: () => {
            if (!replyTo) return false;
            setReplyTo(null);
            return true;
        },
        // ↑ on an empty composer edits your last message — the one behaviour the
        // keyboard contract has declared since Phase 3 that nothing implemented,
        // because editing is owned by the ROW and this component never sees the
        // message list.
        //
        // The list is already in the query cache under the key this channel
        // renders from, so the target is a read rather than new plumbing. The
        // row is reached through a one-field store; returning false when there
        // is nothing to edit lets the keystroke fall through to normal caret
        // movement, which is what makes ↑ safe to bind at all.
        onEditLastOwnMessage: () => {
            const cached = utils.community.getMessages.getInfiniteData({
                channelId,
                limit: COMMUNITY_PAGE_LIMIT,
            });
            const target = findLastOwnMessageId(cached?.pages, author?.userId);
            if (!target) return false;
            requestEdit(target);
            return true;
        },
    });

    // Autosize: reset to `auto` first so the box can SHRINK — measuring
    // scrollHeight against the current height only ever grows it.
    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${Math.min(el.scrollHeight, MAX_COMPOSER_HEIGHT)}px`;
    }, [content]);

    if (locked) {
        return (
            <div className="px-4 pb-5 pt-1">
                <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3.5">
                    <LockIcon className="size-5 shrink-0 text-zinc-500" />
                    <p className="text-[13px] font-medium text-zinc-500">
                        <span className="font-bold text-zinc-400">#{channelName}</span> is read-only — only mods can post here
                    </p>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={onSubmit} className="px-4 pb-5 pt-1">
            {replyTo && (
                <ComposerReplyBanner
                    name={replyTo.userName}
                    preview={replyTo.content}
                    onCancel={() => setReplyTo(null)}
                    className="mx-1"
                />
            )}
            <div className="relative flex items-end bg-zinc-800/50 rounded-2xl border border-flexwhite/10 focus-within:ring-1 focus-within:ring-white/20 transition-all">
                {mentionQuery !== null && mentionMatches.length > 0 && (
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-64 overflow-hidden rounded-2xl bg-[#101011] p-1.5 ring-1 ring-white/10">
                        {mentionMatches.map((m, i) => (
                            <button
                                key={m.username}
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); insertMention(m.username); }}
                                className={`flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-white/[0.06] ${i === 0 ? "bg-white/[0.06]" : ""}`}
                            >
                                <span className="text-[13px] font-bold text-white">@{m.username}</span>
                                {m.name && <span className="truncate text-[12px] font-medium text-zinc-500">{m.name}</span>}
                            </button>
                        ))}
                    </div>
                )}
                <button
                    type="button"
                    className={`ml-2 ${COMPOSER_CONTROL} text-flexwhite/40 transition-colors hover:bg-white/5 hover:text-flexwhite`}
                    title="Add a file"
                >
                    <CreateIcon className="h-5.5 w-5.5" />
                </button>

                {stickers.length > 0 && (
                    <>
                        {stickersOpen && (
                            <button
                                type="button"
                                aria-label="Close stickers"
                                className="fixed inset-0 z-10 cursor-default"
                                onClick={() => setStickersOpen(false)}
                            />
                        )}
                        <button
                            type="button"
                            onClick={() => setStickersOpen((v) => !v)}
                            title="Send a sticker"
                            className={`${COMPOSER_CONTROL} text-flexwhite/40 transition-colors hover:bg-white/5 hover:text-flexwhite`}
                        >
                            <HugeiconsIcon icon={StickerIcon} className="size-5" strokeWidth={2} />
                        </button>
                        {stickersOpen && (
                            <div className="absolute bottom-full left-0 z-20 mb-2 w-80 rounded-2xl bg-[#101011] p-2 ring-1 ring-white/10">
                                <p className="px-2 pb-1.5 pt-1 text-[12px] font-semibold text-zinc-500">Stickers</p>
                                <div className="grid max-h-64 grid-cols-4 gap-1.5 overflow-y-auto hidden-scrollbar">
                                    {stickers.map((s) => (
                                        <button
                                            key={s.id}
                                            type="button"
                                            onClick={() => {
                                                setStickersOpen(false);
                                                sendMessage.mutate({ channelId, content: `:${s.name}:`, fileUrl: s.imageUrl });
                                            }}
                                            title={`:${s.name}:`}
                                            className="grid aspect-square cursor-pointer place-items-center rounded-xl p-1.5 transition-colors hover:bg-white/[0.06]"
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={s.imageUrl} alt={s.name} className="size-full object-contain" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* textarea, not input: an <input> cannot hold a newline at
                    all, so Shift+Enter had nothing to insert and multi-line
                    messages were impossible to compose. */}
                <textarea
                    ref={inputRef}
                    rows={1}
                    value={content}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={onKeyDown}
                    onBlur={() => onStopTyping?.()}
                    disabled={sendMessage.isPending}
                    data-testid="community-composer"
                    className="flex-1 min-w-0 resize-none bg-transparent py-3.5 pr-2 text-md leading-6 text-flexwhite outline-none hidden-scrollbar placeholder:text-flexwhite/35"
                    placeholder={`Message #${channelName}`}
                />

                <button
                    type="submit"
                    disabled={sendMessage.isPending || !content.trim()}
                    className={`mr-2 ${COMPOSER_CONTROL} bg-bleu text-white transition-all hover:bg-bleu/80 active:scale-95 disabled:scale-50 disabled:opacity-0`}
                    title="Send"
                >
                    <ArrowUpIcon className="h-5.5 w-5.5" />
                </button>
            </div>
        </form>
    );
}
