'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime';
import { useEncryption } from '@/hooks/use-encryption';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useOfflineQueue } from '@/hooks/use-offline-queue';
import { trpc } from '@/lib/trpc/client';
import { logger } from '@/lib/logger';
import { flattenDmMessages, mapDmMessages } from '@/lib/messages/dm-cache';

interface DecryptedMessage {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    encryptionIv: string;
    messageType: string;
    attachmentUrl?: string | null;
    createdAt: string;
    editedAt?: string;
    isDecrypted: boolean;
    isEncrypted?: boolean;
    reactions?: {
        id: string;
        emoji: string;
        userId: string;
        messageId: string;
    }[];
    readReceipts?: {
        id: string;
        userId: string;
        messageId: string;
        readAt: string;
    }[];
    replyToMessage?: {
        id: string;
        content: string;
        senderId: string;
        messageType?: string;
        attachmentUrl?: string | null;
        encryptionIv?: string;
        isEncrypted?: boolean;
    } | null;
}

interface MessagesContextType {
    messages: DecryptedMessage[];
    isLoading: boolean;
    error: any;
    isConnected: boolean;
    typingUsers: string[];
    onlineUsers: string[];
    setTyping: (isTyping: boolean) => void;
    conversationId: string;
    /** Load the next page of OLDER messages. No-op when there are none. */
    loadOlder: () => void;
    /** More history exists on the server. */
    hasOlder: boolean;
    /** A page of older messages is in flight. */
    isLoadingOlder: boolean;
}

/**
 * Page size for `message.list`. Exported because it is part of the query KEY:
 * anything reading or writing this query's cache (optimistic sends in
 * `useSendMessage`) must pass the identical input or it addresses a different
 * entry and silently no-ops. That is exactly what happened before — see
 * `hooks/use-messages.ts`.
 */
export const DM_PAGE_LIMIT = 50;

const MessagesContext = createContext<MessagesContextType | undefined>(undefined);

interface MessagesProviderProps {
    children: React.ReactNode;
    conversationId: string;
}

export function MessagesProvider({ children, conversationId }: MessagesProviderProps) {
    const {
        subscribeToConversation,
        unsubscribeFromConversation,
        isConnected,
        typingUsers,
        onlineUsers,
        setTyping: setRealtimeTyping
    } = useSupabaseRealtime();

    const setTyping = useCallback((isTyping: boolean) => {
        setRealtimeTyping(isTyping);
    }, [setRealtimeTyping]);

    const { decryptMessage, isInitialized } = useEncryption();
    const { data: session } = useAuthSession();
    const utils = trpc.useUtils();

    const [decryptedMessages, setDecryptedMessages] = useState<DecryptedMessage[]>([]);

    // Fetch conversation participants to get keys
    const { data: participantsData } = trpc.conversation.getParticipants.useQuery(
        { conversationId },
        { enabled: !!conversationId }
    );

    // Fetch messages from server.
    //
    // INFINITE, so DM history past the newest 50 is reachable at all. The
    // server has taken a keyset `cursor` for a while (composite (createdAt, id),
    // see server/routers/message.ts) and this client never sent one — so a
    // conversation was permanently truncated to one page with no way to look
    // further back.
    //
    // The input keeps `limit` in it. An earlier attempt at infinite here used
    // `{ conversationId }` alone, which is a DIFFERENT cache entry from the one
    // the list subscribes to: optimistic writes went somewhere nothing read,
    // and the rollback snapshot was always undefined. The input must match the
    // subscription exactly.
    const {
        data,
        isLoading,
        error,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = trpc.message.list.useInfiniteQuery(
        { conversationId, limit: DM_PAGE_LIMIT },
        {
            enabled: !!conversationId,
            refetchOnWindowFocus: false,
            getNextPageParam: (last) => last.nextCursor,
        }
    );

    // Pages run newest → oldest and so do the rows inside them, so this is one
    // newest-first list — the same order the single-page version produced,
    // which is why nothing downstream had to change.
    const messages = useMemo(() => flattenDmMessages(data), [data]);

    // Guarded here rather than at the call site: the list asks for older
    // history from a scroll handler, which fires many times per gesture, and
    // fetchNextPage() while a page is already in flight queues a duplicate
    // request for the same cursor.
    const loadOlder = useCallback(() => {
        if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    // Helper to get correct key for decryption
    const getDecryptionKey = useCallback(async (msgSenderId: string, participants?: Array<{ userId: string }>) => {
        const participantsList = participants || participantsData?.participants;

        if (!participantsList || !session?.user?.id) {
            return null;
        }

        const currentUserId = session.user.id;
        const isMe = msgSenderId === currentUserId;

        let targetUserId: string;
        if (isMe) {
            const recipient = participantsList.find(p => p.userId !== currentUserId);
            if (!recipient) {
                console.error('[Decryption] Could not find recipient in participants');
                return null;
            }
            targetUserId = recipient.userId;
        } else {
            targetUserId = msgSenderId;
        }

        try {
            const keyData = await utils.encryption.getPublicKey.fetch({ userId: targetUserId });
            return keyData?.publicKey || null;
        } catch (error) {
            console.error('[Decryption] Failed to fetch public key', { targetUserId, error });
            return null;
        }
    }, [participantsData, session?.user?.id, utils]);

    // Refs for stable access in subscription callbacks
    const decryptMessageRef = useRef(decryptMessage);
    const getDecryptionKeyRef = useRef(getDecryptionKey);
    const participantsDataRef = useRef(participantsData);
    const isInitializedRef = useRef(isInitialized);

    useEffect(() => {
        decryptMessageRef.current = decryptMessage;
        getDecryptionKeyRef.current = getDecryptionKey;
        participantsDataRef.current = participantsData;
        isInitializedRef.current = isInitialized;
    }, [decryptMessage, getDecryptionKey, participantsData, isInitialized]);

    const decryptionCache = useRef<Map<string, DecryptedMessage>>(new Map());

    // Clear cache when conversation changes
    useEffect(() => {
        decryptionCache.current.clear();
        setDecryptedMessages([]);
    }, [conversationId]);

    // OPENING A THREAD READS IT. The per-message receipts in message-list
    // only fire for messages that have no receipt yet, so a thread you read
    // long ago never re-marks itself — and the DM badge counts the
    // conversation-level pointer (conversationParticipants.lastReadAt), not
    // receipts. This is the call site conversation.markAsRead never had:
    // without it the owner's badge sat at 2 for threads read months ago.
    const markConversationRead = trpc.conversation.markAsRead.useMutation({
        onSuccess: () => utils.conversation.getUnreadCount.invalidate(),
    });
    const markConversationReadRef = useRef(markConversationRead.mutate);
    markConversationReadRef.current = markConversationRead.mutate;
    useEffect(() => {
        if (!conversationId || !session?.user?.id) return;
        markConversationReadRef.current({ conversationId });
    }, [conversationId, session?.user?.id]);

    // Load initial messages
    const decryptAll = async () => {
        const participants = participantsData?.participants;
        if (!participants) return;

        const decrypted = await Promise.all(
            messages.map(async (msg) => {
                // Check cache first
                // We use a composite key of ID + UpdatedAt (if available) to invalidate on edits
                const cacheKey = `${msg.id}-${msg.updatedAt || msg.createdAt}`;
                const cached = decryptionCache.current.get(cacheKey);
                if (cached) {
                    // This cache memoizes DECRYPTION, not the row.
                    //
                    // `reactions` and `readReceipts` are plaintext, and neither
                    // is part of the cache key — `message.toggleReaction` only
                    // writes the join table, so a reaction never moves
                    // `messages.updatedAt`. Returning the cached object whole
                    // therefore replayed the reactions captured at FIRST
                    // decrypt and threw away every later version, including the
                    // optimistic patch `message-list.tsx` writes into the query
                    // cache. That is why a DM reaction only appeared once the
                    // realtime frame came back — a full round trip — while the
                    // identical action in community chat paints immediately.
                    //
                    // Re-project the plaintext fields from the fresh row so the
                    // query cache stays the single source of truth for them.
                    return {
                        ...cached,
                        reactions: (msg as any).reactions || [],
                        readReceipts: (msg as any).readReceipts || [],
                    };
                }

                try {
                    // Optimized: If message is already marked as decrypted (e.g. optimistic update), skip decryption
                    if ((msg as any).isDecrypted) {
                        const optimisticMsg = {
                            ...msg,
                            // Ensure structure matches DecryptedMessage
                            reactions: (msg as any).reactions || [],
                            readReceipts: (msg as any).readReceipts || [],
                        } as unknown as DecryptedMessage;

                        // Don't cache optimistic messages permanently as they change ID
                        return optimisticMsg;
                    }

                    const key = await getDecryptionKey(msg.senderId, participants);
                    if (!key) throw new Error('Key missing');

                    const decryptedContent = await decryptMessage(msg.content, msg.encryptionIv, key);

                    // Decrypt reply if present
                    let replyToMessageComputed = msg.replyToMessage;
                    if (msg.replyToMessage && msg.replyToMessage.isEncrypted && msg.replyToMessage.encryptionIv) {
                        try {
                            const replyKey = await getDecryptionKey(msg.replyToMessage.senderId, participants);
                            if (replyKey) {
                                const decryptedReplyContent = await decryptMessage(
                                    msg.replyToMessage.content,
                                    msg.replyToMessage.encryptionIv,
                                    replyKey
                                );
                                replyToMessageComputed = {
                                    ...msg.replyToMessage,
                                    content: decryptedReplyContent,
                                };
                            }
                        } catch (e) {
                            console.warn('Failed to decrypt reply content', e);
                            replyToMessageComputed = {
                                ...msg.replyToMessage,
                                content: '[Encrypted Reply]',
                            };
                        }
                    }

                    const decryptedMsg = {
                        ...msg,
                        content: decryptedContent,
                        encryptionIv: msg.encryptionIv,
                        isDecrypted: true,
                        isEncrypted: false,
                        attachmentUrl: msg.attachmentUrl,
                        reactions: (msg as any).reactions || [],
                        readReceipts: (msg as any).readReceipts || [],
                        replyToMessage: replyToMessageComputed,
                    } as unknown as DecryptedMessage;

                    // Update Cache
                    decryptionCache.current.set(cacheKey, decryptedMsg);

                    return decryptedMsg;

                } catch (error) {
                    return {
                        ...msg,
                        content: '[Encrypted - Decryption Failed]',
                        encryptionIv: msg.encryptionIv,
                        isDecrypted: false,
                        attachmentUrl: msg.attachmentUrl,
                        reactions: (msg as any).reactions || [],
                        readReceipts: (msg as any).readReceipts || [],
                        replyToMessage: msg.replyToMessage,
                    } as DecryptedMessage;
                }
            })
        );

        setDecryptedMessages(decrypted);
    };

    useEffect(() => {
        if (!messages.length || !decryptMessage || !getDecryptionKey || !session?.user?.id || !isInitialized) return;

        decryptAll();
    }, [messages, decryptMessage, getDecryptionKey, participantsData, session?.user?.id, isInitialized]);

    // Listen for new messages
    useEffect(() => {
        let isSubscribed = false;

        const handleNewMessage = async (message: any) => {
            if (message.conversationId !== conversationId) return;

            // Failsafe: If we receive a message from a user, they are not typing anymore
            // Note: We can't update 'typingUsers' directly as it comes from Realtime hook
            // But the realtime hook *should* eventually sync. 
            // We could expose a manual 'clearTypingForUser' in the hook, but let's trust the 'stopTyping' fix first.

            const participants = participantsDataRef.current?.participants ||
                (await utils.conversation.getParticipants.fetch({ conversationId }))?.participants;

            if (!participants) return;

            try {
                const key = await getDecryptionKeyRef.current(message.senderId, participants);
                let decryptedContent = '[Encrypted]';
                let isDecrypted = false;

                if (key && decryptMessageRef.current) {
                    try {
                        decryptedContent = await decryptMessageRef.current(message.content, message.encryptionIv, key);
                        isDecrypted = true;
                    } catch (e) {
                        console.error('[HandleNewMessage] Decryption failed', e);
                    }
                }

                const decryptedMsg: DecryptedMessage = {
                    ...message,
                    content: decryptedContent,
                    encryptionIv: message.encryptionIv,
                    isDecrypted: isDecrypted,
                    attachmentUrl: message.attachmentUrl,
                    reactions: [], // New messages have no reactions initially
                    readReceipts: [], // New messages have no receipts initially
                };

                setDecryptedMessages((prev) => {
                    if (prev.some((m) => m.id === decryptedMsg.id)) return prev;
                    return [...prev, decryptedMsg];
                });

                utils.conversation.list.invalidate();

            } catch (error) {
                logger.error('Failed to process real-time message', error as Error);
            }
        };

        const handleReactionChange = (payload: any) => {
            const { eventType, new: newRecord, old: oldRecord } = payload;

            // Patch the QUERY CACHE as well as local state.
            //
            // `decryptAll` now re-projects `reactions` from the query row on
            // every run (see the decryption-cache note above), so a reaction
            // that lives only in local state is reverted the next time anything
            // touches `data.messages` — e.g. your own optimistic reaction on a
            // different message. Writing both keeps them from disagreeing.
            //
            // The local patch stays because it also covers messages delivered
            // by `handleNewMessage`, which are in state but not yet in the
            // query cache.
            utils.message.list.setInfiniteData({ conversationId, limit: DM_PAGE_LIMIT }, (old) =>
                mapDmMessages(old, (m: any) => {
                        if (eventType === 'INSERT' && newRecord?.message_id === m.id) {
                            const incoming = {
                                id: newRecord.id,
                                emoji: newRecord.emoji,
                                userId: newRecord.user_id,
                                messageId: newRecord.message_id,
                            };
                            // Reconcile on (emoji, userId), not on id: your own
                            // reaction is already here under an `optimistic-`
                            // id, so an id-keyed dedupe would append a SECOND
                            // entry and the chip would read 2 until the refetch.
                            // Replacing also adopts the real id, which is what
                            // the DELETE path matches on.
                            const existing = (m.reactions ?? []).findIndex(
                                (r: any) => r.emoji === incoming.emoji && r.userId === incoming.userId,
                            );
                            if (existing !== -1) {
                                const next = [...(m.reactions ?? [])];
                                next[existing] = incoming;
                                return { ...m, reactions: next };
                            }
                            return { ...m, reactions: [...(m.reactions ?? []), incoming] };
                        }
                        if (eventType === 'DELETE' && oldRecord?.id) {
                            if (!(m.reactions ?? []).some((r: any) => r.id === oldRecord.id)) return m;
                            return {
                                ...m,
                                reactions: (m.reactions ?? []).filter((r: any) => r.id !== oldRecord.id),
                            };
                        }
                        return m;
                }),
            );

            setDecryptedMessages(prev => prev.map(msg => {
                if (eventType === 'INSERT' && newRecord.message_id === msg.id) {
                    const incoming = {
                        id: newRecord.id,
                        emoji: newRecord.emoji,
                        userId: newRecord.user_id,
                        messageId: newRecord.message_id,
                    };
                    // Same (emoji, userId) reconcile as the query-cache patch
                    // above — an id-keyed dedupe misses your own optimistic
                    // entry and shows the reaction twice.
                    const existing = (msg.reactions ?? []).findIndex(
                        (r) => r.emoji === incoming.emoji && r.userId === incoming.userId,
                    );
                    if (existing !== -1) {
                        const next = [...(msg.reactions ?? [])];
                        next[existing] = incoming;
                        return { ...msg, reactions: next };
                    }
                    return { ...msg, reactions: [...(msg.reactions || []), incoming] };
                }

                if (eventType === 'DELETE' && oldRecord.id) {
                    // Check if this message contains the reaction to be deleted
                    // In DELETE payload, we might only get ID, so we check if any reaction matches
                    if (msg.reactions?.some(r => r.id === oldRecord.id)) {
                        return {
                            ...msg,
                            reactions: msg.reactions.filter(r => r.id !== oldRecord.id)
                        };
                    }
                }

                return msg;
            }));
        };

        const handleReadReceipt = (payload: any) => {
            const { eventType, new: newRecord } = payload;

            if (eventType === 'INSERT') {
                setDecryptedMessages(prev => prev.map(msg => {
                    if (newRecord.message_id === msg.id) {
                        // Prevent duplicates
                        if (msg.readReceipts?.some(r => r.id === newRecord.id)) return msg;

                        return {
                            ...msg,
                            readReceipts: [...(msg.readReceipts || []), {
                                id: newRecord.id,
                                userId: newRecord.user_id,
                                messageId: newRecord.message_id,
                                readAt: newRecord.read_at
                            }]
                        };
                    }
                    return msg;
                }));
            }
        };

        if (!isSubscribed) {
            subscribeToConversation(conversationId, handleNewMessage, handleReactionChange, handleReadReceipt);
            isSubscribed = true;
        }

        return () => {
            if (isSubscribed) {
                unsubscribeFromConversation();
                isSubscribed = false;
            }
        };
    }, [conversationId, subscribeToConversation, unsubscribeFromConversation]);



    // Derived loading state to prevent flash of empty state while decrypting
    const isDecrypting = !!messages.length && decryptedMessages.length === 0;
    const showLoading = isLoading || isDecrypting;

    return (
        <MessagesContext.Provider value={{
            messages: decryptedMessages,
            isLoading: showLoading,
            error,
            isConnected,
            typingUsers,
            onlineUsers,
            setTyping,
            conversationId,
            loadOlder,
            hasOlder: !!hasNextPage,
            isLoadingOlder: isFetchingNextPage,
        }}>
            {children}
        </MessagesContext.Provider>
    );
}

export function useMessagesContext() {
    const context = useContext(MessagesContext);
    if (!context) {
        throw new Error('useMessagesContext must be used within a MessagesProvider');
    }
    return context;
}
