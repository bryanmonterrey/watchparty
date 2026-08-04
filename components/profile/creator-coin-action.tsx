"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { TradeUpIcon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { appToast } from "@/components/app-ui/app-toast";
import { TokenLaunchTrigger, TokenLaunchState, DEFAULT_TOKEN_LAUNCH } from "@/components/browse/token-launch";
import { TickerEditDialog } from "@/components/browse/ticker-edit-dialog";

// The creator's own coin, on their profile.
//
// A creator coin is ABOUT a person, so unlike every other coin here it has no
// post behind it and its content page is this profile. It also inverts the
// launch rule: a post's or stream's coin can be launched by ANYONE because the
// first buy IS the launch, but only the creator may launch the coin that
// represents them. A stranger minting "your" coin is impersonation.
//
// That rule is enforced in trade.createCreatorCoin / trade.launchCreatorCoin —
// the mutations take no userId and match on ctx.user.id — so what this component
// does is reflect it, never establish it. Hiding the button is a courtesy; the
// server is the guarantee.
//
// COLOUR: the ad-state yellow from the video scrubber. It marks "there's money
// attached to this" in the player and means the same here — deliberately not
// the brand green, which reads as live.
//
// OUTLINED rather than filled. A solid yellow pill competes with Follow and
// Subscribe for the row's one loud element; an outline keeps the colour's
// meaning while letting the primary action stay primary. The fill arrives on
// hover, so pressing it still feels like a button.
const COIN_YELLOW =
    "border-2 border-yellow-400/80 text-yellow-400 hover:bg-yellow-400/10";

export function CreatorCoinAction({ userId, isOwner }: { userId: string; isOwner: boolean }) {
    const router = useRouter();
    const utils = trpc.useUtils();
    const { data: coin, isLoading } = trpc.trade.getCreatorCoin.useQuery({ userId });

    const [isEditing, setIsEditing] = React.useState(false);
    const [draft, setDraft] = React.useState<TokenLaunchState>({
        ...DEFAULT_TOKEN_LAUNCH,
        earningsEnabled: true,
    });

    const create = trpc.trade.createCreatorCoin.useMutation({
        onSuccess: () => {
            utils.trade.getCreatorCoin.invalidate({ userId });
            appToast.success("coin created");
        },
        onError: (e) => appToast.error(e.message),
    });

    if (isLoading) return null;

    // Someone else's profile: show the coin if there is one, and nothing at all
    // if there isn't. A visitor has no business being offered a control they
    // could never use.
    if (!isOwner) {
        if (!coin) return null;
        return (
            <button
                type="button"
                onClick={() => router.push(`/coin/${coin.tokenAddress ?? coin.id}`)}
                className={cn(
                    "flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[15px] font-bold transition-colors active:scale-95",
                    COIN_YELLOW,
                )}
            >
                {coin.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coin.imageUrl} alt="" className="size-6 shrink-0 rounded-full object-cover" />
                )}
                ${coin.ticker}
            </button>
        );
    }

    // Own profile, no coin yet.
    if (!coin) {
        return (
            <>
                <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className={cn(
                        "flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[15px] font-bold transition-colors active:scale-95",
                        COIN_YELLOW,
                    )}
                >
                    <HugeiconsIcon icon={TradeUpIcon} className="size-5" strokeWidth={2.5} />
                    Create coin
                </button>
                <TickerEditDialog
                    open={isEditing}
                    onOpenChange={setIsEditing}
                    state={draft}
                    onSave={(updates) => {
                        const next = { ...draft, ...updates };
                        setDraft(next);
                        if (next.ticker?.trim()) {
                            create.mutate({
                                ticker: next.ticker.trim(),
                                name: next.name?.trim() || undefined,
                                creatorFeePercent: next.creatorFee,
                            });
                        }
                    }}
                />
            </>
        );
    }

    // Own profile, coin exists. A draft shows BOTH what it is and what pressing
    // it does — the ticker alone hides that it hasn't launched, and "Launch"
    // alone hides which coin. Live drops the verb: there's nothing left to do.
    const isDraft = coin.status !== "live";
    return (
        <button
            type="button"
            onClick={() => router.push(`/coin/${coin.tokenAddress ?? coin.id}`)}
            className={cn(
                "flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[15px] font-bold transition-colors active:scale-95",
                COIN_YELLOW,
            )}
        >
            {isDraft
                ? <HugeiconsIcon icon={TradeUpIcon} className="size-5" strokeWidth={2.5} />
                : coin.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coin.imageUrl} alt="" className="size-6 shrink-0 rounded-full object-cover" />
                )}
            {isDraft ? `Launch $${coin.ticker}` : `$${coin.ticker}`}
        </button>
    );
}
