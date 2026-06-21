'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthSession } from './use-auth-session';
import { useRealtimeRoom } from './use-realtime-room';
import { rooms, type ServerEvent } from '@/lib/realtime/protocol';

/**
 * Realtime layer for a community (Discord-style) channel — now on PartyServer
 * Durable Objects instead of Supabase Realtime.
 *
 * - Presence + typing are **server-scoped** (room keyed by `serverId`), so the
 *   connection stays put as the user hops between channels; typing carries the
 *   active `channelId` and is filtered client-side.
 * - Message changes come from a **channel-scoped** room (keyed by `channelId`):
 *   tRPC mutations persist to Postgres then publish a `message-change` event
 *   (`notifyChannelChange` in the community router), which fires `onMessageChange`.
 */

type TypingUser = { userId: string; userName: string };

type Params = {
    channelId: string;
    serverId: string;
    /** Called on any message change for this channel. */
    onMessageChange?: () => void;
};

const TYPING_TTL = 6000; // drop a typing indicator if no keystroke within this window

export function useCommunityChannel({ channelId, serverId, onMessageChange }: Params) {
    const { data: session } = useAuthSession();
    const userId = session?.user?.id;

    const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
    const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
    const [isConnected, setIsConnected] = useState(false);

    const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const onMessageChangeRef = useRef(onMessageChange);
    onMessageChangeRef.current = onMessageChange;

    const clearTypingLater = useCallback((id: string) => {
        const timers = typingTimers.current;
        const existing = timers.get(id);
        if (existing) clearTimeout(existing);
        timers.set(
            id,
            setTimeout(() => {
                setTypingUsers((prev) => prev.filter((u) => u.userId !== id));
                timers.delete(id);
            }, TYPING_TTL)
        );
    }, []);

    // ─── Presence + typing (server-scoped) ───────────────────
    const { send: sendPresence } = useRealtimeRoom(
        serverId ? rooms.communityPresence(serverId) : null,
        {
            enabled: !!userId,
            onEvent: (e: ServerEvent) => {
                if (e.t === 'presence') {
                    setOnlineUserIds(e.users.map((u) => u.userId));
                } else if (e.t === 'typing') {
                    if (e.channelId !== channelId || e.userId === userId) return;
                    setTypingUsers((prev) =>
                        prev.some((u) => u.userId === e.userId)
                            ? prev
                            : [...prev, { userId: e.userId, userName: e.userName }]
                    );
                    clearTypingLater(e.userId);
                } else if (e.t === 'stop-typing') {
                    if (e.channelId !== channelId) return;
                    setTypingUsers((prev) => prev.filter((u) => u.userId !== e.userId));
                }
            },
        }
    );

    // ─── Message stream (channel-scoped) ─────────────────────
    useRealtimeRoom(channelId ? rooms.communityChannel(channelId) : null, {
        enabled: !!userId,
        onEvent: (e: ServerEvent) => {
            if (e.t === 'event' && e.name === 'message-change') onMessageChangeRef.current?.();
        },
        onStatus: setIsConnected,
    });

    // Reset typing state when switching channels.
    useEffect(() => {
        setTypingUsers([]);
        const timers = typingTimers.current;
        return () => {
            timers.forEach((t) => clearTimeout(t));
            timers.clear();
        };
    }, [channelId]);

    // ─── Typing emitters ─────────────────────────────────────
    const sendTyping = useCallback(() => {
        sendPresence({ t: 'typing', channelId });
    }, [sendPresence, channelId]);

    const sendStopTyping = useCallback(() => {
        sendPresence({ t: 'stop-typing', channelId });
    }, [sendPresence, channelId]);

    return { onlineUserIds, typingUsers, isConnected, sendTyping, sendStopTyping };
}
