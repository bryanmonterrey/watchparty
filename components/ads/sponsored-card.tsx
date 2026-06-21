"use client";

import { useEffect, useRef } from "react";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useAd, fireTracker } from "@/hooks/use-ad";
import { AD_SLOTS } from "@/lib/ads/config";
import { Squircle } from "@/components/ui/squircle";
import { cn } from "@/lib/utils";

function hostOf(url: string): string {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return "";
    }
}

interface SponsoredCardProps {
    className?: string;
}

// In-feed display ad. Mirrors the PostCard row container (padding + divider) so
// it sits natively in the feed. Renders nothing when no campaign fills the slot,
// so the feed simply closes up with no empty gap.
export function SponsoredCard({ className }: SponsoredCardProps) {
    const { data: session } = useAuthSession();
    const { ad } = useAd(AD_SLOTS.feedCard, { userId: session?.user?.id });

    const ref = useRef<HTMLDivElement>(null);
    const impressedRef = useRef(false);

    // Fire the impression once the ad is at least half visible.
    useEffect(() => {
        if (!ad || impressedRef.current) return;
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !impressedRef.current) {
                    impressedRef.current = true;
                    fireTracker(ad.tracking.impression_url);
                    obs.disconnect();
                }
            },
            { threshold: 0.5 },
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, [ad]);

    if (!ad) return null;

    const c = ad.creative;
    const onClick = () => {
        fireTracker(ad.tracking.click_url);
        window.open(c.landing_url, "_blank", "noopener,noreferrer");
    };

    return (
        <article
            ref={ref}
            onClick={onClick}
            className={cn(
                "group cursor-pointer px-4 pt-2.5 pb-3 bg-background border-b border-soft-gray/[0.12] transition-colors hover:bg-zinc-500/[0.04]",
                className,
            )}
        >
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-semibold text-zinc-500">Sponsored</span>
                {hostOf(c.landing_url) && (
                    <span className="text-[13px] text-zinc-500 truncate max-w-[55%]">{hostOf(c.landing_url)}</span>
                )}
            </div>

            {c.image_url && (
                <Squircle radius={18} className="block w-full overflow-hidden mb-2.5">
                    <img
                        src={c.image_url}
                        alt={c.title}
                        loading="lazy"
                        className="w-full h-auto max-h-[420px] object-cover bg-zinc-900"
                    />
                </Squircle>
            )}

            <h3 className="text-[15px] font-bold text-zinc-100 leading-snug">{c.title}</h3>
            {c.description && (
                <p className="mt-0.5 text-[15px] text-zinc-400 leading-snug line-clamp-2">{c.description}</p>
            )}

            <div className="mt-2.5">
                <span className="inline-flex items-center rounded-full bg-twitter2 px-4 py-1.5 text-[13px] font-bold text-white transition-transform group-active:scale-95">
                    Learn more
                </span>
            </div>
        </article>
    );
}
