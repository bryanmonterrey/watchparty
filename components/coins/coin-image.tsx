"use client";

import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { QuestionIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

/**
 * A coin's image, with a question mark where there isn't one.
 *
 * Two different holes, and only the second was ever handled: call sites checked
 * `imageUrl ?` and rendered a blank tile when it was null, but a URL that IS
 * set and fails to LOAD — a dead CDN, a 404, an ipfs gateway that has given up
 * — falls through to the browser's own broken-image glyph. That icon is grey,
 * jagged, differs per browser, and reads as "this app is broken" rather than
 * "this coin has no logo".
 *
 * `onError` is the only way to catch it: nothing about the markup can tell in
 * advance, and the coins that fail are exactly the long-tail ones the board is
 * full of.
 *
 * `QuestionIcon` is the bare glyph — `HelpCircleIcon` / `HelpSquareIcon` are the
 * enclosed variants — so the wrapper's own shape (squircle tile, round avatar)
 * stays the silhouette instead of a circle inside a circle.
 *
 * (`QuestionMarkIcon` appears inside the package's dist files but is NOT an
 * export; grepping the bundle finds it and tsc then rejects it. Confirm an icon
 * name against `declare const` in dist/types, not against a raw grep.)
 */
export function CoinImage({
    src,
    alt = "",
    className,
    iconClassName,
    loading = "lazy",
}: {
    src?: string | null;
    alt?: string;
    /** Sizing + shape. Applied to the image AND to the fallback, so the slot
     *  never changes size when a logo fails. */
    className?: string;
    iconClassName?: string;
    loading?: "lazy" | "eager";
}) {
    const [failed, setFailed] = useState(false);

    // Reset when the row is recycled onto a different coin. Table rows are
    // reused (and virtualized in places), so a sticky `failed` would blank the
    // logo of whatever coin scrolled into that slot next.
    useEffect(() => setFailed(false), [src]);

    if (!src || failed) {
        return (
            <span className={cn("grid place-items-center bg-white/[0.06] text-zinc-500", className)}>
                <HugeiconsIcon icon={QuestionIcon} className={cn("size-1/2", iconClassName)} strokeWidth={2} />
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
            onError={() => setFailed(true)}
        />
    );
}
