"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { TradeUpIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { useQuickBuy } from "@/hooks/use-quick-buy";

// The coin line under a video's identity — image + ticker in one pill, then the
// action. Lifted out of home's video header so the watch and live pages run the
// same object rather than three lookalikes.

export interface TokenRowToken {
    /** The token row id. /coin/<mint> resolves this or the mint. */
    id: string;
    ticker: string | null;
    imageUrl: string | null;
    /** The mint. Absent = nobody has taken the first buy, i.e. not launched. */
    tokenAddress?: string | null;
}

/** `lg` on the video and live pages, where the header runs at page scale;
 *  `sm` is home's compact header; `xs` is the 300px rail row, where a 16px
 *  action was the largest text in a row whose title is 14px. */
type Size = "xs" | "sm" | "lg";

const ACTION_TEXT: Record<Size, string> = {
    xs: "text-[11px]",
    sm: "text-[16px]",
    lg: "text-[16px]",
};

const PILL: Record<Size, string> = {
    xs: "py-0.5 pl-0.5 pr-2 text-[11px]",
    sm: "py-1 pl-1 pr-2.5 text-[12px]",
    lg: "py-1 pl-1.5 pr-3 text-[14px]",
};

const PILL_IMAGE: Record<Size, string> = {
    xs: "size-3.5",
    sm: "size-4",
    lg: "size-5",
};

/**
 * LAUNCH vs BUY is the token model, not a label choice: content always creates a
 * draft, and the first buyer IS the launch — they pay and receive, while the
 * creator keeps the pool identity and fees. So a coin with no mint isn't
 * "closed", it's unclaimed, and Launch is the honest verb for taking it.
 *
 * They behave differently because the two acts are: Buy is one click at the
 * saved preset (same as the trending board), while launching has to name an
 * amount and create the pool, so it goes to the token page's first-buy card.
 */
export function TokenAction({
    token,
    postId,
    size = "sm",
}: {
    token: TokenRowToken;
    postId: string;
    size?: Size;
}) {
    const { quickBuy, buyingId } = useQuickBuy();
    const mint = token.tokenAddress;
    // shrink-0 so the action is never what gives way when the row is tight.
    // inline-flex for the trending arrow that leads the label — it lives here
    // rather than at each call site so the home, video and live headers can't
    // drift into three different-looking actions.
    const label = cn(
        "inline-flex shrink-0 items-center gap-0.5 font-extrabold text-twitter2 transition-opacity hover:opacity-80",
        ACTION_TEXT[size],
    );
    // The same mark the header's trade switcher gives Perpetuals, so the coin
    // action and that menu row read as the same idea.
    const arrow = (
        <HugeiconsIcon
            icon={TradeUpIcon}
            className={size === "xs" ? "size-3.5" : "size-4"}
            strokeWidth={2.5}
        />
    );

    if (!mint) {
        return (
            <Link href={`/coin/${token.id}`} className={label}>
                {arrow}
                Launch
            </Link>
        );
    }

    const buying = buyingId === postId;
    return (
        <button
            type="button"
            disabled={buying}
            onClick={() => {
                void quickBuy({
                    id: postId,
                    tokenAddress: mint,
                    symbol: token.ticker ?? "",
                    imageUrl: token.imageUrl,
                });
            }}
            className={cn(label, "cursor-pointer disabled:opacity-50")}
        >
            {arrow}
            {buying ? "Buying…" : "Buy"}
        </button>
    );
}

export function TokenRow({
    token,
    postId,
    size = "sm",
    showAction = true,
    fallbackImage,
    className,
}: {
    token: TokenRowToken;
    /** What quickBuy keys its in-flight state on. */
    postId: string;
    size?: Size;
    /** False renders the ticker alone — the rail wants the pill without a CTA. */
    showAction?: boolean;
    /**
     * Shown when the coin has no art of its own, in place of the blank circle.
     * The live page passes the host's avatar: a stream's pill is the channel's
     * coin, so the channel's face is the sensible default.
     */
    fallbackImage?: string | null;
    className?: string;
}) {
    if (!token.ticker) return null;
    const slug = token.tokenAddress ?? token.id;
    const image = token.imageUrl ?? fallbackImage ?? null;

    return (
        <div className={cn("flex min-w-0 items-center gap-2", size === "xs" ? "flex-nowrap" : "flex-wrap", className)}>
            {/* Image INSIDE the pill, not floating beside it — TokenInlineChip
                does the same, so a loose circle would make one object look like
                two different components. pl-1 balances the image's own inset
                against the text's pr-2.5. */}
            <Link
                href={`/coin/${slug}`}
                className={cn(
                    "flex min-w-0 items-center gap-1.5 rounded-full bg-bleu/15 font-semibold border border-bleu/20 text-bleu transition-colors hover:bg-bleu/50",
                    PILL[size],
                )}
            >
                {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={image}
                        alt=""
                        loading="lazy"
                        className={cn("shrink-0 rounded-full object-cover", PILL_IMAGE[size])}
                    />
                ) : (
                    // Keeps the pill's width steady whether or not the coin has art.
                    <span className={cn("shrink-0 rounded-full bg-bleu/40", PILL_IMAGE[size])} />
                )}
                <span className="truncate">${token.ticker}</span>
            </Link>

            {showAction && <TokenAction token={token} postId={postId} size={size} />}
        </div>
    );
}
