"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useQuickBuy } from "@/hooks/use-quick-buy";

// The coin line under a video's identity — image + ticker in one pill, then the
// action. Lifted out of home's video header so the watch and live pages run the
// same object rather than three lookalikes.

export interface TokenRowToken {
    /** The token row id. /[slug] resolves this or the mint. */
    id: string;
    ticker: string | null;
    imageUrl: string | null;
    /** The mint. Absent = nobody has taken the first buy, i.e. not launched. */
    tokenAddress?: string | null;
}

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
function TokenAction({ token, postId }: { token: TokenRowToken; postId: string }) {
    const { quickBuy, buyingId } = useQuickBuy();
    const mint = token.tokenAddress;
    const label = "text-[12px] font-extrabold text-royal-blue transition-opacity hover:opacity-80";

    if (!mint) {
        return (
            <Link href={`/${token.id}`} className={label}>
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
            {buying ? "Buying…" : "Buy"}
        </button>
    );
}

export function TokenRow({
    token,
    postId,
    className,
}: {
    token: TokenRowToken;
    /** What quickBuy keys its in-flight state on. */
    postId: string;
    className?: string;
}) {
    if (!token.ticker) return null;
    const slug = token.tokenAddress ?? token.id;

    return (
        <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>
            {/* Image INSIDE the pill, not floating beside it — TokenInlineChip
                does the same, so a loose circle would make one object look like
                two different components. pl-1 balances the image's own inset
                against the text's pr-2.5. */}
            <Link
                href={`/${slug}`}
                className="flex items-center gap-1.5 rounded-full bg-white/[0.06] py-1 pl-1 pr-2.5 text-[12px] font-extrabold text-white transition-colors hover:bg-white/10"
            >
                {token.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={token.imageUrl}
                        alt=""
                        loading="lazy"
                        className="size-4 shrink-0 rounded-full object-cover"
                    />
                ) : (
                    // Keeps the pill's width steady whether or not the coin has art.
                    <span className="size-4 shrink-0 rounded-full bg-white/10" />
                )}
                ${token.ticker}
            </Link>

            <TokenAction token={token} postId={postId} />
        </div>
    );
}
