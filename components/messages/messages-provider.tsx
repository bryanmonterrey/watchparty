'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime';
import { useEncryption } from '@/hooks/use-encryption';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useOfflineQueue } from '@/hooks/use-offline-queue';
import { trpc } from '@/lib/trpc/client';
import { logger } from '@/lib/logger';

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

    // Fetch messages from server
    const { data, isLoading, error } = trpc.message.list.useQuery(
        { conversationId, limit: DM_PAGE_LIMIT },
        {
            enabled: !!conversationId,
            refetchOnWindowFocus: false,
        }
    );

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

    // Load initial messages
    const decryptAll = async () => {
        const participants = participantsData?.participants;
        if (!participants) return;

        const decrypted = await Promise.all(
            (data?.messages || []).map(async (msg) => {
                // Check cache first
                // We use a composite key of ID + UpdatedAt (if available) to invalidate on edits
                const cacheKey = `${msg.id}-${msg.updatedAt || msg.createdAt}`;
                if (decryptionCache.current.has(cacheKey)) {
                    return decryptionCache.current.get(cacheKey)!;
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
        if (!data?.messages || !decryptMessage || !getDecryptionKey || !session?.user?.id || !isInitialized) return;

        decryptAll();
    }, [data?.messages, decryptMessage, getDecryptionKey, participantsData, session?.user?.id, isInitialized]);

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

            setDecryptedMessages(prev => prev.map(msg => {
                if (eventType === 'INSERT' && newRecord.message_id === msg.id) {
                    // Prevent duplicates
                    if (msg.reactions?.some(r => r.id === newRecord.id)) return msg;

                    return {
                        ...msg,
                        reactions: [...(msg.reactions || []), {
                            id: newRecord.id,
                            emoji: newRecord.emoji,
                            userId: newRecord.user_id,
                            messageId: newRecord.message_id
                        }]
                    };
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
    const isDecrypting = !!data?.messages?.length && decryptedMessages.length === 0;
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
            conversationId
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
