'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthSession } from './use-auth-session';
import { createRoomSocket, isRealtimeEnabled } from '@/lib/realtime/client';
import { parseServerEvent, rooms, type ClientMessage } from '@/lib/realtime/protocol';
import type PartySocket from 'partysocket';

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

interface UseRealtimeReturn {
    isConnected: boolean;
    error: string | null;
    subscribeToConversation: (
        conversationId: string,
        onMessage: (message: Message) => void,
        onReactionChange?: (payload: any) => void,
        onReadReceipt?: (payload: any) => void
    ) => void;
    unsubscribeFromConversation: () => void;
    onlineUsers: string[];
    typingUsers: string[];
    setTyping: (isTyping: boolean) => void;
}

const TYPING_TTL = 4000; // clear a peer's typing indicator if no signal within this window

/**
 * DM realtime — PartyServer Durable Object transport (was Supabase Realtime).
 *
 * Same interface as before so `MessagesProvider` is unchanged:
 *  - new messages, reaction changes, and read receipts arrive as DO events
 *    whose payloads match the previous Supabase `postgres_changes` shapes
 *    (server-published from the message router after each DB write).
 *  - presence + typing run over the same per-conversation room.
 *
 * Edits/deletes were never delivered over realtime in the Supabase version;
 * that scope is preserved.
 */
export function useSupabaseRealtime(): UseRealtimeReturn {
    const { data: session } = useAuthSession();
    const userId = session?.user?.id;

    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
    const [typingUsers, setTypingUsers] = useState<string[]>([]);

    const socketRef = useRef<PartySocket | null>(null);
    const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const clearTypingLater = useCallback((id: string) => {
        const timers = typingTimers.current;
        const existing = timers.get(id);
        if (existing) clearTimeout(existing);
        timers.set(
            id,
            setTimeout(() => {
                setTypingUsers((prev) => prev.filter((u) => u !== id));
                timers.delete(id);
            }, TYPING_TTL)
        );
    }, []);

    const teardown = useCallback(() => {
        socketRef.current?.close();
        socketRef.current = null;
        typingTimers.current.forEach((t) => clearTimeout(t));
        typingTimers.current.clear();
        setIsConnected(false);
        setOnlineUsers([]);
        setTypingUsers([]);
    }, []);

    const subscribeToConversation = useCallback(
        (
            conversationId: string,
            onMessage: (message: Message) => void,
            onReactionChange?: (payload: any) => void,
            onReadReceipt?: (payload: any) => void
        ) => {
            if (!userId) {
                setError('No session found');
                return;
            }
            if (!isRealtimeEnabled()) return; // realtime worker not configured

            teardown();

            const socket = createRoomSocket(rooms.dm(conversationId));
            socketRef.current = socket;

            socket.addEventListener('open', () => {
                setIsConnected(true);
                setError(null);
            });
            socket.addEventListener('close', () => setIsConnected(false));

            socket.addEventListener('message', (ev: MessageEvent) => {
                if (typeof ev.data !== 'string') return;
                const event = parseServerEvent(ev.data);
                if (!event) return;

                switch (event.t) {
                    case 'message':
                        onMessage(event.payload as Message);
                        break;
                    case 'presence':
                        setOnlineUsers(event.users.map((u) => u.userId));
                        break;
                    case 'typing':
                        if (event.userId === userId) break;
                        setTypingUsers((prev) =>
                            prev.includes(event.userId) ? prev : [...prev, event.userId]
                        );
                        clearTypingLater(event.userId);
                        break;
                    case 'stop-typing':
                        setTypingUsers((prev) => prev.filter((u) => u !== event.userId));
                        break;
                    case 'event':
                        if (event.name === 'reaction') onReactionChange?.(event.payload);
                        else if (event.name === 'read-receipt') onReadReceipt?.(event.payload);
                        break;
                }
            });
        },
        [userId, teardown, clearTypingLater]
    );

    const unsubscribeFromConversation = useCallback(() => {
        teardown();
    }, [teardown]);

    const setTyping = useCallback((isTyping: boolean) => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== 1) return;
        const msg: ClientMessage = isTyping ? { t: 'typing' } : { t: 'stop-typing' };
        socket.send(JSON.stringify(msg));
    }, []);

    // Cleanup on unmount
    useEffect(() => () => teardown(), [teardown]);

    return {
        isConnected,
        error,
        subscribeToConversation,
        unsubscribeFromConversation,
        onlineUsers,
        typingUsers,
        setTyping,
    };
}
