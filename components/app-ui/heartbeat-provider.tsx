"use client";

import { useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";

export function HeartbeatProvider() {
    const { data: session } = useAuthSession();
    const heartbeat = trpc.user.heartbeat.useMutation();

    useEffect(() => {
        if (!session?.user) return;

        // Fire immediately on mount
        heartbeat.mutate();

        // Re-fire every 4 minutes
        const interval = setInterval(() => heartbeat.mutate(), 4 * 60 * 1000);

        // Re-fire on tab focus
        const onFocus = () => heartbeat.mutate();
        window.addEventListener("focus", onFocus);

        return () => {
            clearInterval(interval);
            window.removeEventListener("focus", onFocus);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id]);

    return null;
}
