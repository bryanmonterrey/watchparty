"use client";

import { useEffect, useState } from "react";
import { ADS_ENABLED } from "@/lib/ads/config";
import type { Ad } from "@/lib/ads/types";

interface UseAdOptions {
    userId?: string;
    interests?: string[];
    /** Skip the request entirely (e.g. slot not in view yet). */
    enabled?: boolean;
}

/** Fetches a single display creative for `slotId` from our first-party route. */
export function useAd(slotId: string, opts: UseAdOptions = {}) {
    const { userId, interests, enabled = true } = opts;
    const [ad, setAd] = useState<Ad | null>(null);
    const [loading, setLoading] = useState(ADS_ENABLED && enabled);

    useEffect(() => {
        if (!ADS_ENABLED || !enabled) return;
        let cancelled = false;
        setLoading(true);
        fetch("/api/ad/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slot_id: slotId, user_id: userId, interests }),
        })
            .then((r) => (r.ok ? r.json() : { ad: null }))
            .then((d: { ad: Ad | null }) => {
                if (!cancelled) setAd(d.ad ?? null);
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
        // interests is intentionally not a dep — slot + user identify the request
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slotId, userId, enabled]);

    return { ad, loading };
}

/** Fire a tracking pixel (impression/click) — same-origin, fire-and-forget. */
export function fireTracker(url?: string) {
    if (!url || typeof window === "undefined") return;
    const img = new Image();
    img.src = url;
}
