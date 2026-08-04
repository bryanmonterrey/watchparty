"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

// The post's coin badge: token image, then $TICKER, both inside one
// rounded-full. Anatomy is TokenInlineChip's (components/tokens/
// token-inline-chip.tsx) — that chip is the canonical shape for "a coin, in a
// pill" — scaled down here, since it's h-9 and these rows are built around
// 18–20px icon buttons it has to sit beside.
//
// Extracted because four surfaces show it now: the feed card header, the post
// detail author row, and the two ImageViewer side panels. Each of those used to
// carry a Gemini spark in the same slot instead.
//
// COLOUR CARRIES STATUS, not decoration: emerald once the token is live, muted
// zinc while it's still a draft. That distinction is the whole reason the badge
// is worth its space, so it holds on the no-image fallback too.

export interface PostTickerPillProps {
    ticker: string;
    /** "live" once the coin has launched; anything else reads as a draft. */
    tokenStatus?: string | null;
    /** The coin's mark. Falls back to a tinted disc — never a letter. */
    tokenImage?: string | null;
    /**
     * `sm` for the feed card, whose dots button is 18px.
     * `md` for the post detail and the viewer panels, which are built a step up.
     */
    size?: "sm" | "md";
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
    /** The coin this badge belongs to. Given one, the pill navigates to its
     *  page — which is what a coin badge on a post is FOR. Without it the pill
     *  was inert AND swallowed the click, so tapping it neither opened the coin
     *  nor opened the post. */
    tokenId?: string | null;
}

export function PostTickerPill({
    ticker,
    tokenStatus,
    tokenImage,
    size = "sm",
    className,
    onClick,
    tokenId,
}: PostTickerPillProps) {
    const router = useRouter();
    const live = tokenStatus === "live";
    const md = size === "md";

    return (
        <button
            type="button"
            // The pill sits inside clickable rows (a feed card navigates to the
            // post), so it must not take the row's click with it.
            onClick={(e) => {
                e.stopPropagation();
                if (onClick) { onClick(e); return; }
                if (tokenId) router.push(`/coin/${tokenId}`);
            }}
            className={cn(
                // Asymmetric padding on purpose: the mark sits nearly flush with
                // the left edge while the text keeps a normal inset, so it reads
                // as part of the pill rather than a circle floating inside one.
                "flex shrink-0 cursor-pointer items-center rounded-full transition-colors active:scale-95",
                md ? "h-8 gap-2 pl-1 pr-3" : "h-7 gap-1.5 pl-1 pr-2.5",
                live
                    ? "bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30"
                    : "bg-zinc-700/40 text-zinc-400 hover:bg-zinc-700/60",
                className,
            )}
        >
            {tokenImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={tokenImage}
                    alt=""
                    className={cn("shrink-0 rounded-full object-cover", md ? "size-6" : "size-5")}
                />
            ) : (
                <span
                    className={cn(
                        "shrink-0 rounded-full",
                        md ? "size-6" : "size-5",
                        live ? "bg-emerald-500/30" : "bg-zinc-600/50",
                    )}
                />
            )}
            <span className={cn("font-medium tracking-tighter", md ? "text-[13px]" : "text-xs")}>
                ${ticker}
            </span>
        </button>
    );
}
