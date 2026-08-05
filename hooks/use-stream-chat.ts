'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type PartySocket from 'partysocket';
import { createRoomSocket, isRealtimeEnabled } from '@/lib/realtime/client';
import { parseServerEvent, rooms, type ChatReply } from '@/lib/realtime/protocol';

export type StreamChatMessage = {
    id: string;
    userId: string;
    sender: string;
    content: string;
    /** DO-stamped send time; the Appearance panel's timestamps read it. */
    ts: number;
    /** Resolved by the DO, not the sender — see ChatReply in the protocol. */
    replyTo?: ChatReply;
};

/**
 * Live stream chat over a PartyServer Durable Object (replaces AWS IVS Chat).
 *
 * Ephemeral and high fan-out: messages go client → DO → all viewers with no DB
 * round trip. The DO stamps sender identity (anti-spoof), rate-limits, and skips
 * per-viewer presence. Joiners get a one-shot replay of the room's recent lines
 * (last CHAT_HISTORY_MAX, kept in DO storage) then live messages, capped at 200
 * in memory.
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
                    { id: e.id, userId: e.userId, sender: e.name, content: e.text, ts: e.ts, replyTo: e.replyTo },
                ]);
            } else if (e?.t === 'chat-history') {
                // One-shot replay on join (and on reconnect): the room's recent
                // lines replace anything local so order stays authoritative.
                setMessages(e.lines.map((l) => ({ id: l.id, userId: l.userId, sender: l.name, content: l.text, ts: l.ts, replyTo: l.replyTo })));
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

    const send = useCallback((text: string, replyTo?: string) => {
        const socket = socketRef.current;
        const trimmed = text.trim();
        if (!socket || socket.readyState !== 1 || !trimmed) return;
        socket.send(JSON.stringify({ t: 'chat', text: trimmed, replyTo }));
    }, []);

    return { messages, send, connected };
}
