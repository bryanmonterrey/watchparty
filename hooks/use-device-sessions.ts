"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth/client";

/**
 * Every account signed in on this device — better-auth's multiSession plugin.
 *
 * Each sign-in already registers itself: the plugin's after-hook matches every
 * endpoint that mints a session, so OTP, OAuth, SIWS and passkey logins all
 * land in this list without any per-flow code. What the app has to provide is
 * the UI, which is what this hook feeds.
 *
 * The rows carry the full user record (the plugin runs parseUserOutput, so our
 * `additionalFields` — username, avatar_url, wallet_address — come through), so
 * a switcher needs no second lookup.
 */

/** Keep in step with `maximumSessions` in lib/auth/server.ts. */
export const MAX_DEVICE_ACCOUNTS = 10;

export interface DeviceSession {
    session: { token: string; userId: string; expiresAt: string | Date };
    user: {
        id: string;
        name?: string | null;
        email?: string | null;
        username?: string | null;
        avatar_url?: string | null;
    };
}

export function useDeviceSessions(enabled = true) {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ["device-sessions"],
        queryFn: async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data } = await (authClient as any).multiSession.listDeviceSessions();
            return (data ?? []) as DeviceSession[];
        },
        enabled,
        staleTime: 60_000,
    });

    const setActive = useMutation({
        mutationFn: async (sessionToken: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = await (authClient as any).multiSession.setActive({ sessionToken });
            if (res?.error) throw new Error(res.error.message ?? "Could not switch account");
            return res;
        },
        // A hard reload rather than cache invalidation, deliberately. Switching
        // the active session changes who every server component, tRPC query and
        // cached list belongs to — repainting from a warm cache would show the
        // previous account's data under the new account's name.
        onSuccess: () => {
            window.location.reload();
        },
    });

    const revoke = useMutation({
        mutationFn: async (sessionToken: string) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const res = await (authClient as any).multiSession.revoke({ sessionToken });
            if (res?.error) throw new Error(res.error.message ?? "Could not log out that account");
            return res;
        },
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
