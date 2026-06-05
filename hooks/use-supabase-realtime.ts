'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useAuthSession } from './use-auth-session';
import { logger } from '@/lib/logger';
import { getRealtimeClient, authenticateRealtimeClient } from '@/lib/supabase/realtime-client';

export interface Message {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    encryptionIv: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    editedAt: string | null;
    messageType: string;
    attachmentUrl?: string | null;
    replyToId?: string | null;
}

interface PresenceState {
    [userId: string]: {
        online_at: string;
        typing?: boolean;
        user_id?: string;
    }[];
}

interface UseSupabaseRealtimeReturn {
    channel: RealtimeChannel | null;
    isConnected: boolean;
    error: string | null;
    subscribeToConversation: (
        conversationId: string,
        onMessage: (message: Message) => void,
        onReactionChange?: (payload: any) => void,
        onReadReceipt?: (payload: any) => void
    ) => void;
    unsubscribeFromConversation: () => void;
    // Presence features
    onlineUsers: string[];
    typingUsers: string[];
    setTyping: (isTyping: boolean) => void;
}

/**
 * Hook for Supabase Realtime subscriptions + Presence
 * Uses a singleton client to prevent multiple GoTrueClient conflicts
 */
export function useSupabaseRealtime(): UseSupabaseRealtimeReturn {
    const { data: session } = useAuthSession();
    const [channel, setChannel] = useState<RealtimeChannel | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const channelRef = useRef<RealtimeChannel | null>(null);
    const isSubscribingRef = useRef(false);
    const currentConversationRef = useRef<string | null>(null);

    // Presence state
    const [presenceState, setPresenceState] = useState<PresenceState>({});

    // Subscribe to a conversation's messages + presence
    const subscribeToConversation = useCallback(
        async (
            conversationId: string,
            onMessage: (message: Message) => void,
            onReactionChange?: (payload: any) => void,
            onReadReceipt?: (payload: any) => void
        ) => {
            if (!session?.user) {
                setError('No session found');
                return;
            }

            // Prevent concurrent subscriptions to the same conversation
            if (isSubscribingRef.current && currentConversationRef.current === conversationId) {
                return;
            }

            isSubscribingRef.current = true;
            currentConversationRef.current = conversationId;

            const client = getRealtimeClient();

            // Unsubscribe from previous channel if exists
            if (channelRef.current) {
                console.log('[Realtime] Removing previous channel');
                await client.removeChannel(channelRef.current);
                channelRef.current = null;
            }

            try {
                await authenticateRealtimeClient();
            } catch (err) {
                console.error('[Realtime] Authentication failed:', err);
                setError('Failed to authenticate realtime connection');
                return;
            }

            console.log('[Realtime] Creating channel for conversation:', conversationId);

            const newChannel = client.channel(`conversation:${conversationId}`, {
                config: {
                    presence: {
                        key: session.user.id,
                    },
                },
            });

            newChannel
                // 1. Listen for new messages
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'messages',
                        filter: `conversation_id=eq.${conversationId}`,
                    },
                    (payload) => {
                        console.log('[Realtime] INSERT received:', payload.new.id);

                        const newMessage: Message = {
                            id: payload.new.id,
                            conversationId: payload.new.conversation_id,
                            senderId: payload.new.sender_id,
                            content: payload.new.content,
                            encryptionIv: payload.new.encryption_iv,
                            messageType: payload.new.message_type,
                            createdAt: payload.new.created_at,
                            updatedAt: payload.new.updated_at || payload.new.created_at,
                            deletedAt: payload.new.deleted_at || null,
                            editedAt: payload.new.edited_at,
                            attachmentUrl: payload.new.attachment_url,
                            replyToId: payload.new.reply_to_id,
                        };

                        onMessage(newMessage);
                    }
                )
                // 1.5 Listen for reactions
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'message_reactions',
                    },
                    (payload) => {
                        if (onReactionChange) onReactionChange(payload);
                    }
                )
                // 1.6 Listen for read receipts
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'message_read_receipts',
                    },
                    (payload) => {
                        if (onReadReceipt) onReadReceipt(payload);
                    }
                )
                // 2. Listen for presence sync
                .on('presence', { event: 'sync' }, () => {
                    const state = newChannel.presenceState();
                    // Force new object reference to trigger React re-render
                    setPresenceState({ ...state } as unknown as PresenceState);
                })
                .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                    // console.log('[Presence] Join:', key, newPresences);
                })
                .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                    // console.log('[Presence] Leave:', key, leftPresences);
                })
                .subscribe(async (status: string) => {
                    console.log('[Realtime] Subscription Status:', status);

                    if (status === 'SUBSCRIBED') {
                        setIsConnected(true);
                        setError(null);

                        // Initial presence tracking
                        await newChannel.track({
                            online_at: new Date().toISOString(),
                            typing: false,
                        });

                    } else if (status === 'CHANNEL_ERROR') {
                        setIsConnected(false);
                        setError('Realtime channel error');
                    } else if (status === 'TIMED_OUT') {
                        setIsConnected(false);
                        setError('Realtime timed out');
                    }
                });

            channelRef.current = newChannel;
            setChannel(newChannel);
            isSubscribingRef.current = false;
        },
        [session?.user]
    );

    // Unsubscribe
    const unsubscribeFromConversation = useCallback(() => {
        if (channelRef.current) {
            const client = getRealtimeClient();
            client.removeChannel(channelRef.current);
            channelRef.current = null;
            setChannel(null);
            setIsConnected(false);
            setPresenceState({});
            currentConversationRef.current = null;
        }
    }, []);

    // Cleanup
    useEffect(() => {
        return () => {
            if (channelRef.current) {
                const client = getRealtimeClient();
                client.removeChannel(channelRef.current);
            }
        };
    }, []);

    // Derived State
    const onlineUsers = Object.keys(presenceState);

    // Raw typing users
    const rawTypingUsers = Object.entries(presenceState)
        .filter(([key, presences]) => {
            // Check if ANY presence for this key involves typing
            const isTyping = presences.some((p: any) => p.typing === true);

            // Try to find the REAL user ID from payload, fallback to key
            const userId = presences[0]?.user_id || key;

            if (userId === session?.user?.id) return false;
            return isTyping;
        })
        .map(([key, presences]) => presences[0]?.user_id || key);

    // Debounced typing users to prevent flickering (Fast On, Slow Off)
    const [debouncedTypingUsers, setDebouncedTypingUsers] = useState<string[]>([]);
    const typingTimeoutRef = useRef<any>(null);

    // Use stringified key to safely compare content
    const rawTypingEventsKey = JSON.stringify(rawTypingUsers);

    useEffect(() => {
        const hasNewTyping = rawTypingUsers.length > 0;
        const currentHasTyping = debouncedTypingUsers.length > 0;

        if (hasNewTyping) {
            // Fast On: If anyone is typing, show immediately
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            setDebouncedTypingUsers(rawTypingUsers);
        } else if (currentHasTyping && !hasNewTyping) {
            // Slow Off: If everyone stopped, wait a bit before clearing to prevent flicker
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
                setDebouncedTypingUsers([]);
            }, 500); // 500ms grace period
        }

        return () => {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rawTypingEventsKey]);

    // Track last sent state to handle transitions vs keep-alives
    const lastTypingStateRef = useRef<boolean>(false);
    const lastTypingTimestampRef = useRef<number>(0);

    // Set Typing Helper (Simplified)
    const setTyping = useCallback(async (isTyping: boolean) => {
        if (!channelRef.current || !isConnected) return;

        // No throttling, no checks. Just send it.
        // The UI handles debounce.
        try {
            await channelRef.current.track({
                user_id: session?.user?.id,
                online_at: new Date().toISOString(),
                typing: isTyping,
            });
        } catch (err) {
            console.error('[TypingDebug] Error:', err);
        }
    }, [isConnected, session?.user?.id]);

    return {
        channel,
        isConnected,
        error,
        subscribeToConversation,
        unsubscribeFromConversation,
        onlineUsers,
        typingUsers: debouncedTypingUsers, // Polished, debounced feedback
        setTyping,
    };
}
