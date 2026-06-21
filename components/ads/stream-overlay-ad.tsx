"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useAd, fireTracker } from "@/hooks/use-ad";
import { AD_SLOTS } from "@/lib/ads/config";
import { Squircle } from "@/components/ui/squircle";

// Dismissible banner overlaid on the live-stream player (bottom-anchored, above
// the controls). Renders nothing until a campaign fills the stream_overlay slot.
export function StreamOverlayAd() {
    const { data: session } = useAuthSession();
    const { ad } = useAd(AD_SLOTS.streamOverlay, { userId: session?.user?.id });
    const [dismissed, setDismissed] = useState(false);
    const impressedRef = useRef(false);

    useEffect(() => {
        if (ad && !impressedRef.current) {
            impressedRef.current = true;
            fireTracker(ad.tracking.impression_url);
        }
    }, [ad]);

    if (!ad || dismissed) return null;

    const c = ad.creative;
    const onClick = () => {
        fireTracker(ad.tracking.click_url);
        window.open(c.landing_url, "_blank", "noopener,noreferrer");
    };

    return (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-30 flex justify-center px-4">
            <Squircle
                radius={16}
                className="pointer-events-auto flex w-full max-w-sm items-center gap-3 bg-black/80 p-2.5 pr-9 backdrop-blur-md ring-1 ring-white/10"
            >
                <button
                    type="button"
                    onClick={onClick}
                    className="flex flex-1 items-center gap-3 text-left cursor-pointer min-w-0"
                >
                    {c.image_url && (
                        <Squircle radius={10} className="block h-11 w-11 shrink-0 overflow-hidden">
                            <img src={c.image_url} alt={c.title} className="h-full w-full object-cover" />
                        </Squircle>
                    )}
                    <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/50">Sponsored</p>
                        <p className="truncate text-[13px] font-bold text-white">{c.title}</p>
                        {c.description && (
                            <p className="truncate text-[12px] text-white/60">{c.description}</p>
                        )}
                    </div>
                </button>
                <button
                    type="button"
                    aria-label="Dismiss ad"
                    onClick={() => setDismissed(true)}
                    className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white cursor-pointer"
                >
                    <X className="h-3 w-3" />
                </button>
            </Squircle>
        </div>
    );
}
