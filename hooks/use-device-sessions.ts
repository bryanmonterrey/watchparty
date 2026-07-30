"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
    listDeviceSessions,
    revokeDeviceSession,
    setActiveDeviceSession,
    type DeviceSessionRow,
} from "@/lib/auth/client";

/**
 * Every account signed in on this device — better-auth's multiSession plugin.
 *
 * Each sign-in already registers itself: the plugin's after-hook matches every
 * endpoint that mints a session, so OTP, OAuth, SIWS and passkey logins all
 * land in this list without any per-flow code. What the app has to provide is
 * the UI, which is what this hook feeds.
 */

/** Keep in step with `maximumSessions` in lib/auth/server.ts. */
export const MAX_DEVICE_ACCOUNTS = 10;

export type DeviceSession = DeviceSessionRow;

export function useDeviceSessions(enabled = true) {
    const queryClient = useQueryClient();
    const router = useRouter();

    const query = useQuery({
        queryKey: ["device-sessions"],
        queryFn: listDeviceSessions,
        enabled,
        staleTime: 60_000,
    });

    const setActive = useMutation({
        mutationFn: async (sessionToken: string) => {
            const res = await setActiveDeviceSession(sessionToken);
            if (res?.error) throw new Error(res.error.message ?? "Could not switch account");
            return res;
        },
        // No page reload. The cookie has already flipped by the time this
        // resolves, so the two things that still hold the old account's data are
        // the query cache and the rendered server components — clear one, refresh
        // the other, and client state (open drawer, scroll position) survives.
        //
        // clear() rather than invalidateQueries: invalidation keeps serving stale
        // data while it refetches, which here means the previous account's
        // balances under the new account's name.
        onSuccess: () => {
            queryClient.clear();
            router.refresh();
        },
    });

    const revoke = useMutation({
        mutationFn: async (sessionToken: string) => {
            const res = await revokeDeviceSession(sessionToken);
            if (res?.error) throw new Error(res.error.message ?? "Could not log out that account");
            return res;
        },
        // Only the list changes — the active account is untouched, so there is
        // nothing to refresh beyond it.
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["device-sessions"] });
        },
    });

    const accounts = query.data ?? [];

    return {
        accounts,
        isLoading: query.isPending,
        /** True once adding another account would silently fail to register. */
        atCapacity: accounts.length >= MAX_DEVICE_ACCOUNTS,
        setActive,
        revoke,
        refetch: query.refetch,
    };
}
