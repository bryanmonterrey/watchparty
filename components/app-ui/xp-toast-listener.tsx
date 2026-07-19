"use client";

import * as React from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

// Surfaces level-ups and quest completions as top-center toasts wherever the
// user is in the app. Awarding is server-side (awardXP/recordQuestEvent write
// a system notification), so this just watches the notification stream — a
// light poll of the newest few rows, no second delivery pipeline.
export function XpToastListener() {
    const { data } = trpc.notification.getNotifications.useQuery(
        { limit: 10 },
        { refetchInterval: 45_000, refetchOnWindowFocus: true },
    );
    const lastSeen = React.useRef<number | null>(null);

    React.useEffect(() => {
        if (!data?.notifications) return;
        const newest = data.notifications[0] ? new Date(data.notifications[0].createdAt).getTime() : 0;
        if (lastSeen.current === null) {
            // First load: baseline only — don't replay old notifications.
            lastSeen.current = newest;
            return;
        }
        for (const n of data.notifications) {
            const ts = new Date(n.createdAt).getTime();
            if (ts <= lastSeen.current) break;
            if (n.type === "system" && n.body?.startsWith("Level up!")) {
                toast.success(n.body, { duration: 6000 });
            } else if (n.type === "system" && n.body?.startsWith("Quest complete:")) {
                toast.success(n.body, { duration: 5000 });
            }
        }
        lastSeen.current = Math.max(lastSeen.current, newest);
    }, [data]);

    return null;
}
