"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { TradeUpIcon } from "@hugeicons/core-free-icons";
import { CreateIcon } from "@/components/icons";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { appToast } from "@/components/app-ui/app-toast";
import { TokenLaunchState, DEFAULT_TOKEN_LAUNCH } from "@/components/browse/token-launch";
import { TickerEditDialog } from "@/components/browse/ticker-edit-dialog";
import { useTokenLaunch } from "@/hooks/use-token-launch";

// The creator's own coin, on their profile.
//
// A creator coin is ABOUT a person: no post behind it, and its content page is
// this profile. It also inverts the launch rule — a post's or stream's coin can
// be launched by ANYONE because the first buy IS the launch, but only the
// creator may launch the coin that represents them. A stranger minting "your"
// coin is impersonation.
//
// Enforced in trade.createCreatorCoin / trade.launchCreatorCoin, which mint
// against ctx.user.id and take no userId to spoof. This component reflects that
// rule; it never establishes it.
//
// THE PILL'S COLOUR IS ITS STATE:
//
//   draft  yellow — the ad-state yellow from the video scrubber, which already
//          means "money is attached to this". Nothing has minted, so there's no
//          price to have an opinion about yet.
//   live   green or red by 24h change — once it trades, the one thing worth
//          saying at a glance is which way it's going.
//
// Outlined rather than filled throughout: a solid pill competes with Follow and
// Subscribe for the row's one loud element.
const PILL_BASE =
    "flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border-2 px-4 text-[15px] font-bold transition-colors active:scale-95";
const PILL_DRAFT = "border-yellow-400/80 text-yellow-400 hover:bg-yellow-400/10";
// The entry point: no border, and twitter2 rather than the draft yellow.
// Yellow is the colour of a draft that EXISTS; nothing exists yet at this
// point, so the button is an invitation rather than a status.
const PILL_CREATE =
    "flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[15px] font-bold text-twitter2 transition-colors hover:bg-twitter2/10 active:scale-95";
const PILL_UP = "border-long/80 text-long hover:bg-long/10";
const PILL_DOWN = "border-short/80 text-short hover:bg-short/10";

export function CreatorCoinAction({ userId, isOwner }: { userId: string; isOwner: boolean }) {
    const router = useRouter();
    const utils = trpc.useUtils();
    const { launchToken, isLaunching } = useTokenLaunch();
    const { data: coin, isLoading } = trpc.trade.getCreatorCoin.useQuery({ userId });

    const [isEditing, setIsEditing] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [draft, setDraft] = React.useState<TokenLaunchState>({
        ...DEFAULT_TOKEN_LAUNCH,
        earningsEnabled: true,
    });

    const create = trpc.trade.createCreatorCoin.useMutation();
    const recordLaunch = trpc.trade.launchCreatorCoin.useMutation();

    // The profile this pill sits on — a creator coin's content page.
    const profilePath = () =>
        typeof window === "undefined" ? "" : `/${window.location.pathname.split("/").filter(Boolean)[0] ?? ""}`;

    // Create, and launch in the same breath when a first buy is set.
    //
    // The first buy IS the launch, so the amount is optional rather than a
    // separate step: without one the coin is a draft holding a ticker, which is
    // a perfectly good place to stop.
    const submit = async (next: TokenLaunchState) => {
        if (!next.ticker?.trim()) return;
        setBusy(true);
        try {
            await create.mutateAsync({
                ticker: next.ticker.trim(),
                name: next.name?.trim() || undefined,
                creatorFeePercent: next.creatorFee,
            });

            const wantsLaunch = !!next.buyAmount && next.buyAmount > 0;
            if (wantsLaunch) {
                const result = await launchToken(
                    {
                        name: next.name?.trim() || next.ticker.trim(),
                        symbol: next.ticker.trim(),
                        image: "",
                        description: "",
                        contentPath: profilePath(),
                    },
                    { ...next, earningsEnabled: true },
                );
                if (result.success && result.tokenAddress && result.poolAddress) {
                    await recordLaunch.mutateAsync({
                        tokenAddress: result.tokenAddress,
                        poolAddress: result.poolAddress,
                    });
                }
            }

            utils.trade.getCreatorCoin.invalidate({ userId });
            appToast.success(wantsLaunch ? "coin launched" : "coin created");
        } catch (e) {
            appToast.error(e instanceof Error ? e.message : "couldn't create your coin");
        } finally {
            setBusy(false);
        }
    };

    // Launching an existing draft is the same first-buy flow, just later.
    const launchExisting = async (next: TokenLaunchState) => {
        if (!next.buyAmount || next.buyAmount <= 0) {
            appToast.error("set a first buy amount to launch");
            return;
        }
        setBusy(true);
        try {
            const result = await launchToken(
                {
                    name: coin?.name ?? next.ticker,
                    symbol: coin?.ticker ?? next.ticker,
                    image: coin?.imageUrl ?? "",
                    description: coin?.description ?? "",
                    contentPath: profilePath(),
                },
                { ...next, earningsEnabled: true },
            );
            if (result.success && result.tokenAddress && result.poolAddress) {
                await recordLaunch.mutateAsync({
                    tokenAddress: result.tokenAddress,
                    poolAddress: result.poolAddress,
                });
                utils.trade.getCreatorCoin.invalidate({ userId });
                appToast.success("coin launched");
            }
        } catch (e) {
            appToast.error(e instanceof Error ? e.message : "launch failed");
        } finally {
            setBusy(false);
        }
    };

    if (isLoading) return null;

    // Someone else's profile. getCreatorCoin hides drafts from non-creators, so
    // anything reaching here is live and tradeable.
    if (!isOwner) {
        if (!coin) return null;
        const up = (coin.priceChange24h ?? 0) >= 0;
        return (
            <button
                type="button"
                onClick={() => router.push(`/coin/${coin.tokenAddress ?? coin.id}`)}
                className={cn(PILL_BASE, up ? PILL_UP : PILL_DOWN)}
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
                    disabled={busy || isLaunching}
                    className={cn(PILL_CREATE, "disabled:opacity-50")}
                >
                    <CreateIcon className="size-5" strokeWidth={2.5} />
                    {busy || isLaunching ? "Creating…" : "Creator coin"}
                </button>
                <TickerEditDialog
                    open={isEditing}
                    onOpenChange={setIsEditing}
                    state={draft}
                    onSave={(updates) => {
                        const next = { ...draft, ...updates };
                        setDraft(next);
                        void submit(next);
                    }}
                />
            </>
        );
    }

    const isDraft = coin.status !== "live";

    // Own draft: the pill IS the launch control. Pressing it reopens the dialog,
    // where a first-buy amount is what turns it live.
    if (isDraft) {
        return (
            <>
                <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    disabled={busy || isLaunching}
                    className={cn(PILL_BASE, PILL_DRAFT, "disabled:opacity-50")}
                >
                    <HugeiconsIcon icon={TradeUpIcon} className="size-5" strokeWidth={2.5} />
                    {busy || isLaunching ? "Launching…" : `$${coin.ticker}`}
                </button>
                <TickerEditDialog
                    open={isEditing}
                    onOpenChange={setIsEditing}
                    state={{ ...draft, ticker: coin.ticker, name: coin.name ?? "" }}
                    onSave={(updates) => {
                        const next = { ...draft, ticker: coin.ticker, ...updates };
                        setDraft(next);
                        void launchExisting(next);
                    }}
                />
            </>
        );
    }

    const up = (coin.priceChange24h ?? 0) >= 0;
    return (
        <button
            type="button"
            onClick={() => router.push(`/coin/${coin.tokenAddress ?? coin.id}`)}
            className={cn(PILL_BASE, up ? PILL_UP : PILL_DOWN)}
        >
            {coin.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coin.imageUrl} alt="" className="size-6 shrink-0 rounded-full object-cover" />
            )}
            ${coin.ticker}
        </button>
    );
}
