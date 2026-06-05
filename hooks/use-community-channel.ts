'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { useAuthSession } from './use-auth-session';
import { getRealtimeClient, authenticateRealtimeClient } from '@/lib/supabase/realtime-client';

/**
 * Realtime layer for a community (Discord-style) channel.
 *
 * - Subscribes to `community_messages` postgres changes for the active channel and
 *   fires `onMessageChange` (INSERT / UPDATE / DELETE) so the caller can refetch.
 * - Tracks **server-wide** presence so the member list reflects who is online across
 *   any channel of the server — not just the current one.
 * - Relays per-channel typing via broadcast.
 *
 * Two realtime channels are used: presence/typing is keyed by `serverId` (stays put as
 * the user hops between channels) while the postgres subscription is keyed by `channelId`.
 */

type TypingUser = { userId: string; userName: string };

type Params = {
    channelId: string;
    serverId: string;
    /** Called on any community_messages change for this channel. */
    onMessageChange?: () => void;
};

const TYPING_TTL = 6000; // drop a typing indicator if no keystroke within this window

export function useCommunityChannel({ channelId, serverId, onMessageChange }: Params) {
    const { data: session } = useAuthSession();
    const userId = session?.user?.id;
    const userName = session?.user?.name ?? session?.user?.username ?? 'Someone';

    const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
    const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
    const [isConnected, setIsConnected] = useState(false);

    const presenceRef = useRef<RealtimeChannel | null>(null);
    const messagesRef = useRef<RealtimeChannel | null>(null);
    const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    // Keep the change callback fresh without resubscribing.
    const onMessageChangeRef = useRef(onMessageChange);
    onMessageChangeRef.current = onMessageChange;

    const clearTyping = useCallback((id: string) => {
        const timer = typingTimers.current.get(id);
        if (timer) clearTimeout(timer);
        typingTimers.current.set(
            id,
            setTimeout(() => {
                setTypingUsers((prev) => prev.filter((u) => u.userId !== id));
                typingTimers.current.delete(id);
            }, TYPING_TTL)
        );
    }, []);

    // ─── Presence + typing (server-scoped) ───────────────────
    useEffect(() => {
        if (!userId || !serverId) return;
        let cancelled = false;

        (async () => {
            const client = getRealtimeClient();
            try {
                await authenticateRealtimeClient();
            } catch {
                return;
            }
            if (cancelled) return;

            const channel = client.channel(`community:presence:${serverId}`, {
                config: { presence: { key: userId } },
            });

            channel
                .on('presence', { event: 'sync' }, () => {
                    setOnlineUserIds(Object.keys(channel.presenceState()));
                })
                .on('broadcast', { event: 'typing' }, ({ payload }) => {
                    const p = payload as TypingUser & { channelId: string };
                    if (p.channelId !== channelId || p.userId === userId) return;
                    setTypingUsers((prev) =>
                        prev.some((u) => u.userId === p.userId)
                            ? prev
                            : [...prev, { userId: p.userId, userName: p.userName }]
                    );
                    clearTyping(p.userId);
                })
                .on('broadcast', { event: 'stop-typing' }, ({ payload }) => {
                    const p = payload as { userId: string; channelId: string };
                    if (p.channelId !== channelId) return;
                    setTypingUsers((prev) => prev.filter((u) => u.userId !== p.userId));
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await channel.track({ online_at: new Date().toISOString() });
                    }
                });

            presenceRef.current = channel;
        })();

        return () => {
            cancelled = true;
            const timers = typingTimers.current;
            if (presenceRef.current) {
                getRealtimeClient().removeChannel(presenceRef.current);
                presenceRef.current = null;
            }
            timers.forEach((t) => clearTimeout(t));
            timers.clear();
            setTypingUsers([]);
        };
    }, [serverId, channelId, userId, clearTyping]);

    // ─── Message stream (channel-scoped) ─────────────────────
    useEffect(() => {
        if (!userId || !channelId) return;
        let cancelled = false;

        (async () => {
            const client = getRealtimeClient();
            try {
                await authenticateRealtimeClient();
            } catch {
                return;
            }
            if (cancelled) return;

            const channel = client.channel(`community:messages:${channelId}`);
            channel
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'community_messages',
                        filter: `channel_id=eq.${channelId}`,
                    },
                    () => onMessageChangeRef.current?.()
                )
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') setIsConnected(true);
                    else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setIsConnected(false);
                });

            messagesRef.current = channel;
        })();

        return () => {
            cancelled = true;
            if (messagesRef.current) {
                getRealtimeClient().removeChannel(messagesRef.current);
                messagesRef.current = null;
            }
            setIsConnected(false);
        };
    }, [channelId, userId]);

    // ─── Typing emitter ──────────────────────────────────────
    const sendTyping = useCallback(() => {
        presenceRef.current?.send({
            type: 'broadcast',
            event: 'typing',
            payload: { userId, userName, channelId },
        });
    }, [userId, userName, channelId]);

    const sendStopTyping = useCallback(() => {
        presenceRef.current?.send({
            type: 'broadcast',
            event: 'stop-typing',
            payload: { userId, channelId },
        });
    }, [userId, channelId]);

    return { onlineUserIds, typingUsers, isConnected, sendTyping, sendStopTyping };
}
