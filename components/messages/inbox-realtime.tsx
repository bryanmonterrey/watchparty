"use client";

import { useInboxRealtime } from "@/hooks/use-inbox-realtime";

/**
 * Mount point for the user's inbox socket — renders nothing, same shape as
 * HeartbeatProvider. It lives in AppProviders rather than the messages page
 * because the whole point is hearing about a DM while you're somewhere else.
 */
export function InboxRealtime() {
    useInboxRealtime();
    return null;
}
