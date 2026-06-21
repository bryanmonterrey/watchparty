'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type PartySocket from 'partysocket';
import { createRoomSocket, isRealtimeEnabled } from '@/lib/realtime/client';
import { parseServerEvent, rooms } from '@/lib/realtime/protocol';

export type StreamChatMessage = {
    id: string;
    userId: string;
    sender: string;
    content: string;
};

/**
 * Live stream chat over a PartyServer Durable Object (replaces AWS IVS Chat).
 *
 * Ephemeral and high fan-out: messages go client → DO → all viewers with no DB
 * round trip. The DO stamps sender identity (anti-spoof), rate-limits, and skips
 * per-viewer presence. Like IVS, there's no history — joiners start empty and
 * keep the last 200 lines in memory.
 */
export function useStreamChat(streamId: string | null | undefined, enabled: boolean) {
    const [messages, setMessages] = useState<StreamChatMessage[]>([]);
    const [connected, setConnected] = useState(false);
    const socketRef = useRef<PartySocket | null>(null);

    useEffect(() => {
        if (!streamId || !enabled || !isRealtimeEnabled()) return;

        const socket = createRoomSocket(rooms.streamChat(streamId));
        socketRef.current = socket;

        const onMessage = (ev: MessageEvent) => {
            if (typeof ev.data !== 'string') return;
            const e = parseServerEvent(ev.data);
            if (e?.t === 'chat') {
                setMessages((prev) => [
                    ...prev.slice(-199),
                    { id: e.id, userId: e.userId, sender: e.name, content: e.text },
                ]);
            }
        };
        const onOpen = () => setConnected(true);
        const onClose = () => setConnected(false);

        socket.addEventListener('message', onMessage);
        socket.addEventListener('open', onOpen);
        socket.addEventListener('close', onClose);

        return () => {
            socket.removeEventListener('message', onMessage);
            socket.removeEventListener('open', onOpen);
            socket.removeEventListener('close', onClose);
            socket.close();
            socketRef.current = null;
            setConnected(false);
            setMessages([]);
        };
    }, [streamId, enabled]);

    const send = useCallback((text: string) => {
        const socket = socketRef.current;
        const trimmed = text.trim();
        if (!socket || socket.readyState !== 1 || !trimmed) return;
        socket.send(JSON.stringify({ t: 'chat', text: trimmed }));
    }, []);

    return { messages, send, connected };
}
