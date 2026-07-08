"use client";

import Link from "next/link";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

// Shared placeholder for trade sections that exist in the nav before they
// exist as products (Perpetuals, Predictions). Brand-tinted glow, pixel
// display type — a moment, not an apology.

export function TradeComingSoon({
    icon,
    title,
    description,
}: {
    icon: IconSvgElement;
    title: string;
    description: string;
}) {
    return (
        <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-6 md:pt-(--header-height)">
            {/* Brand-tinted ambient glow — never a gray shadow */}
            <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-lantern/10 blur-[140px]" />

            <div className="flex size-16 items-center justify-center rounded-full bg-lantern/10 text-lantern shadow-[inset_0_1px_0_rgba(255,255,255,.08)]">
                <HugeiconsIcon icon={icon} className="size-7" strokeWidth={1.8} />
            </div>

            <h1 className="mt-6 text-center font-pixel text-4xl tracking-tighter text-white sm:text-5xl">
                {title}
            </h1>
            <p className="mt-3 max-w-sm text-center text-[15px] font-medium text-zinc-500">
                {description}
            </p>

            <Link
                href="/trade"
                className="mt-8 rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition-transform hover:scale-[1.02] active:scale-95"
            >
                Back to Discover
            </Link>
        </div>
    );
}
