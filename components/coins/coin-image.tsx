"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { logClient } from "@/lib/client-log";

/**
 * The bare question mark, lifted out of HugeIcons' circled variant.
 *
 * There is no plain question-mark export in @hugeicons/core-free-icons.
 * `QuestionIcon` is a PERSON WITH A SPEECH BUBBLE — not a question mark at all
 * — and the only actual glyphs are `HelpCircleIcon` / `HelpSquareIcon`, which
 * are the same two paths (hook + dot) wrapped in a circle or a square. Those
 * enclosures are wrong here: the slot already has a shape (squircle tile, round
 * avatar), so a circled mark renders as a circle inside a circle.
 *
 * So the two glyph paths are inlined verbatim from HelpCircleIcon, minus its
 * `<circle>`. The viewBox is cropped to the glyph's own bounds (plus half a
 * stroke) rather than kept at 0 0 24 24, where the mark occupies about a fifth
 * of the box and renders as a speck.
 */
function QuestionMark({ className }: { className?: string }) {
    return (
        <svg
            viewBox="8.5 6 7 12"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden
        >
            <path d="M9.5 9.5C9.5 8.11929 10.6193 7 12 7C13.3807 7 14.5 8.11929 14.5 9.5C14.5 10.3569 14.0689 11.1131 13.4117 11.5636C12.7283 12.0319 12 12.6716 12 13.5" />
            <path d="M12.125 16.75H12M12.25 16.75C12.25 16.8881 12.1381 17 12 17C11.8619 17 11.75 16.8881 11.75 16.75C11.75 16.6119 11.8619 16.5 12 16.5C12.1381 16.5 12.25 16.6119 12.25 16.75Z" />
        </svg>
    );
}

/**
 * Logged once per coin+url per page load.
 *
 * The failure mode is a WHOLE BOARD at once — a chain whose logos all 404, a
 * dead CDN — so an undeduped line would be fifty identical entries per render
 * and the signal would be unreadable in `wrangler tail`.
 */
const reported = new Set<string>();

function reportMissing(detail: { coin?: string; src?: string | null; reason: "missing" | "load-failed" }) {
    const key = `${detail.coin ?? "?"}|${detail.src ?? ""}|${detail.reason}`;
    if (reported.has(key)) return;
    reported.add(key);
    logClient("coin:no-image", detail);
}

/**
 * A coin's image, with a question mark where there isn't one.
 *
 * Two different holes, and only the second was ever handled: call sites checked
 * `imageUrl ?` and rendered a blank tile when it was null, but a URL that IS
 * set and fails to LOAD — a dead CDN, a 404, an ipfs gateway that has given up
 * — falls through to the browser's own broken-image glyph.
 *
 * Both cases now log to `/api/client-log` (tag `coin:no-image`, visible in
 * `wrangler tail`), because "this coin has no logo" and "this coin's logo is
 * 404ing" need completely different fixes and look identical on screen:
 *
 *   reason "missing"      the row carried no imageUrl at all — an upstream gap,
 *                         chase the sync that wrote the row
 *   reason "load-failed"  a URL was present and the browser could not fetch it,
 *                         and `src` is in the line so it can be curled
 */
export function CoinImage({
    src,
    alt = "",
    className,
    iconClassName,
    coin,
    loading = "lazy",
}: {
    src?: string | null;
    alt?: string;
    /** Sizing + shape. Applied to the image AND to the fallback, so the slot
     *  never changes size when a logo fails. */
    className?: string;
    iconClassName?: string;
    /** Short identity for the log line — without it "an image failed" is not
     *  actionable. `coinTag(network, address)` or `symbol:address`. */
    coin?: string;
    loading?: "lazy" | "eager";
}) {
    const [failed, setFailed] = useState(false);

    // Reset when the row is recycled onto a different coin. Table rows are
    // reused (and virtualized in places), so a sticky `failed` would blank the
    // logo of whatever coin scrolled into that slot next.
    useEffect(() => setFailed(false), [src]);

    // In an effect, not in render: reporting during render would fire again on
    // every re-render and runs during SSR, where logClient is a no-op anyway.
    useEffect(() => {
        if (!src) reportMissing({ coin, src, reason: "missing" });
    }, [src, coin]);

    if (!src || failed) {
        return (
            <span className={cn("grid place-items-center bg-white/[0.06] text-zinc-500", className)}>
                <QuestionMark className={cn("h-1/2 w-auto", iconClassName)} />
            </span>
        );
    }

    return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
            src={src}
            alt={alt}
            loading={loading}
            className={cn("object-cover", className)}
            onError={() => {
                reportMissing({ coin, src, reason: "load-failed" });
                setFailed(true);
            }}
        />
    );
}
