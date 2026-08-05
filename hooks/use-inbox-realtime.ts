'use client';

import { useEffect, useRef } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useAuthSession } from './use-auth-session';
import { createRoomSocket, isRealtimeEnabled } from '@/lib/realtime/client';
import { parseServerEvent, rooms, INBOX_CONVERSATION_EVENT } from '@/lib/realtime/protocol';

/**
 * Keeps the signed-in user's message list live from anywhere in the app.
 *
 * `useSupabaseRealtime` covers the conversation you have OPEN — it joins that
 * one `dm:` room. Nothing covered the rest: someone messaging you while you sat
 * on /feed, or in a different thread, moved nothing on your screen. The list
 * was only ever invalidated when YOU sent something, so an incoming DM waited
 * for a manual refresh (the sidebar's unread badge polls on a 30s timer, which
 * is what made this look half-working rather than broken).
 *
 * One socket for the whole app, mounted once in AppProviders. The event carries
 * no content — it says a thread moved, and the queries go ask.
 */
export function useInboxRealtime() {
    const { data: session } = useAuthSession();
    const userId = session?.user?.id;
    const utils = trpc.useUtils();

    // utils is treated as stable elsewhere in the app, but this effect owns a
    // WebSocket: if that assumption were ever wrong, listing it as a dependency
    // would tear the socket down and reopen it on every render. A ref keeps the
    // handler current without putting the connection at the mercy of it.
    const utilsRef = useRef(utils);
    utilsRef.current = utils;

    useEffect(() => {
        if (!userId || !isRealtimeEnabled()) return;

        const socket = createRoomSocket(rooms.inbox(userId));

        const onMessage = (ev: MessageEvent) => {
            if (typeof ev.data !== 'string') return;
            const event = parseServerEvent(ev.data);
            if (!event || event.t !== 'event' || event.name !== INBOX_CONVERSATION_EVENT) return;

            // The list itself, and the unread badge that reads off the same
            // rows. Deliberately NOT message.list: the open conversation gets
            // its messages from its own room, and invalidating here would
            // refetch a thread that already has the message.
            utilsRef.current.conversation.list.invalidate();
            utilsRef.current.conversation.getUnreadCount.invalidate();
        };

        socket.addEventListener('message', onMessage);
        return () => {
            socket.removeEventListener('message', onMessage);
            socket.close();
        };
    }, [userId]);
}
