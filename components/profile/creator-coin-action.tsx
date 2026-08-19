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
import { CreatorCoinLaunchDialog } from "./creator-coin-launch-dialog";
import { useTokenLaunch } from "@/hooks/use-token-launch";
import { useAuthSession } from "@/hooks/use-auth-session";

// The creator's own coin, on their profile.
//
// A creator coin is ABOUT a person: no post behind it, and its content page is
// this profile. CREATING one is creator-only — the ticker, name and fee are
// what make it represent someone, and a stranger authoring those is
// impersonation (enforced in trade.createCreatorCoin, which mints against
// ctx.user.id and takes no userId to spoof).
//
// LAUNCHING it is not creator-only. The first buy is a purchase of something
// the creator already authored, so it follows the same rule as every other coin
// here: anyone can be the first buyer, and the creator keeps the pool identity
// and fees regardless. Hence two different dialogs — the owner gets
// TickerEditDialog (edit + launch), a visitor gets CreatorCoinLaunchDialog
// (first buy only, everything else read-only).
//
// THE PILL'S COLOUR IS ITS STATE:
//
//   draft  yellow — the ad-state yellow from the video scrubber, which already
//          means "money is attached to this". Nothing has minted, so there's no
//          price to have an opinion about yet.
//   live   green or red by 24h change — once it trades, the one thing worth
//          saying at a glance is which way it's going.
//
// Colour alone carries the state — only the live pills take a border, where the
// ring reads as a price you can act on. Draft and create stay borderless: they
// carry no price.
const PILL_BASE =
    "flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[15px] font-bold transition-colors active:scale-95";
const PILL_DRAFT = "text-yellow-400 hover:bg-yellow-400/10";
// The entry point: twitter2 rather than the draft yellow. Yellow is the colour
// of a draft that EXISTS; nothing exists yet at this point, so the button is an
// invitation rather than a status.
//
// The only one of these that sits on a tint at rest — it's an invitation, so it
// reads as a thing to press rather than a label. Hover lifts the same tint one
// step instead of introducing a second colour.
const PILL_CREATE = "bg-twitter2/10 text-twitter2 hover:bg-twitter2/15";
const PILL_UP = "border-2 border-long/80 text-long hover:bg-long/10";
const PILL_DOWN = "border-2 border-short/80 text-short hover:bg-short/10";

export function CreatorCoinAction({
    userId,
    isOwner,
    creatorWallet = null,
    creatorAvatar = null,
}: {
    userId: string;
    isOwner: boolean;
    /** Kept as the coin's fee destination when a visitor makes the first buy. */
    creatorWallet?: string | null;
    creatorAvatar?: string | null;
}) {
    const router = useRouter();
    const utils = trpc.useUtils();
    const { launchToken, isLaunching } = useTokenLaunch();
    const { data: coin, isLoading } = trpc.trade.getCreatorCoin.useQuery({ userId });

    // `isOwner` is false for two different reasons — "not the owner" and "not
    // known yet" (pre-hydration, or the session still in flight). Rendering on
    // the second one puts a VISITOR's launch dialog on your own profile, and
    // when the session lands the branch swaps under you: the open dialog
    // unmounts and the next press opens the owner's edit dialog instead.
    // So wait for ownership to actually be knowable before choosing a branch.
    const { isPending: sessionPending } = useAuthSession();
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => { setMounted(true); }, []);
    const ownershipResolved = mounted && !sessionPending;

    const [isEditing, setIsEditing] = React.useState(false);
    const [isLaunchingDraft, setIsLaunchingDraft] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [draft, setDraft] = React.useState<TokenLaunchState>({
        ...DEFAULT_TOKEN_LAUNCH,
        earningsEnabled: true,
    });

    const create = trpc.trade.createCreatorCoin.useMutation();
    const updateDraft = trpc.trade.updateCreatorCoin.useMutation();
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
                        // createCreatorCoin defaults the row's image to the
                        // creator's avatar; the MINT has to get the same one or
                        // a coin created and launched in one go carries no art
                        // at all, permanently.
                        image: creatorAvatar || "",
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

    // Saving an existing draft, and launching it too when a first buy is set.
    //
    // A draft is editable precisely because nothing is on-chain yet, so a
    // rename is a normal save rather than an error — the first buy is what
    // freezes the ticker. Edits are persisted BEFORE the launch so the mint
    // carries what's on screen; launching from stale DB values was the old
    // behaviour and it silently threw the rename away.
    const saveDraft = async (next: TokenLaunchState) => {
        const ticker = next.ticker?.trim();
        if (!ticker) return;
        const wantsLaunch = !!next.buyAmount && next.buyAmount > 0;

        // The dialog saves on close, so an untouched open would otherwise fire
        // a pointless write on every dismissal.
        const edited =
            ticker.toUpperCase() !== (coin?.ticker ?? "").toUpperCase() ||
            (next.name?.trim() || "") !== (coin?.name ?? "") ||
            next.creatorFee !== (coin?.creatorFeePercent ?? undefined);
        if (!edited && !wantsLaunch) return;

        setBusy(true);
        try {
            if (edited) {
                await updateDraft.mutateAsync({
                    ticker,
                    name: next.name?.trim() || undefined,
                    creatorFeePercent: next.creatorFee,
                });
            }

            if (wantsLaunch) {
                const result = await launchToken(
                    {
                        name: next.name?.trim() || ticker,
                        symbol: ticker,
                        // Whatever mints here is the coin's art forever, so the
                        // creator's face fills the blank rather than launching
                        // imageless — same rule the visitor path follows.
                        image: coin?.imageUrl || creatorAvatar || "",
                        description: coin?.description ?? "",
                        contentPath: profilePath(),
                    },
                    { ...next, ticker, earningsEnabled: true },
                );
                if (result.success && result.tokenAddress && result.poolAddress) {
                    await recordLaunch.mutateAsync({
                        tokenAddress: result.tokenAddress,
                        poolAddress: result.poolAddress,
                    });
                }
            }

            utils.trade.getCreatorCoin.invalidate({ userId });
            appToast.success(wantsLaunch ? "coin launched" : "saved");
        } catch (e) {
            appToast.error(e instanceof Error ? e.message : wantsLaunch ? "launch failed" : "couldn't save");
        } finally {
            setBusy(false);
        }
    };

    if (isLoading || !ownershipResolved) {
        // Reserve the row's height for the OWNER only.
        //
        // The owner always ends up with something here — the coin pill, or the
        // "Creator coin" invitation when they have none — so the space is
        // certain to be filled and holding it costs nothing. Without this the
        // pill appears from nothing and shoves the coin row and tabs down, the
        // same jump the follow counts had (1c24eea8).
        //
        // A visitor is the opposite case and deliberately gets nothing: this
        // renders null for them whenever the profile has no coin, which is most
        // profiles, so reserving would leave a gap that COLLAPSES on arrival —
        // trading a push-down for a jump-up on the commoner path.
        //
        // `isOwner` is safe to branch on here in a way it is not below: false
        // means "visitor OR not known yet", but TRUE is unambiguous, and true is
        // the only case this reserves for.
        if (!isOwner) return null;
        return (
            <span className="inline-grid" aria-hidden>
                {/* Sized by an invisible copy of the real label rather than a
                    guessed width, so the swap cannot re-measure. "Creator coin"
                    is the wider of the two outcomes and the one an owner without
                    a coin actually gets. */}
                <span className={cn(PILL_BASE, "invisible [grid-area:1/1]")}>Creator coin</span>
                <span className="shimmer-skeleton my-1 rounded-full [grid-area:1/1]" />
            </span>
        );
    }

    // Someone else's profile.
    if (!isOwner) {
        if (!coin) return null;

        // Their draft. A visitor gets the LAUNCH dialog, never the edit one:
        // the ticker/name/fee are the creator's authorship and stay read-only,
        // but the first buy is open to anyone (the buy IS the launch), exactly
        // like a post's or stream's coin.
        if (coin.status !== "live") {
            return (
                <>
                    <button
                        type="button"
                        onClick={() => setIsLaunchingDraft(true)}
                        className={cn(PILL_BASE, PILL_DRAFT)}
                    >
                        <HugeiconsIcon icon={TradeUpIcon} className="size-5" strokeWidth={2.5} />
                        ${coin.ticker}
                    </button>
                    <CreatorCoinLaunchDialog
                        open={isLaunchingDraft}
                        onOpenChange={setIsLaunchingDraft}
                        coin={coin}
                        creatorWallet={creatorWallet}
                        creatorAvatar={creatorAvatar}
                        onLaunched={() => utils.trade.getCreatorCoin.invalidate({ userId })}
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

    // Own profile, no coin yet.
    if (!coin) {
        return (
            <>
                <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    disabled={busy || isLaunching}
                    className={cn(PILL_BASE, PILL_CREATE, "disabled:opacity-50")}
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

    // Own draft: the pill opens the editor. Nothing is on-chain yet, so the
    // ticker, name and fee are all still editable — a first-buy amount is what
    // turns it live and freezes them.
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
                    {busy || isLaunching ? "Saving…" : `$${coin.ticker}`}
                </button>
                <TickerEditDialog
                    open={isEditing}
                    onOpenChange={setIsEditing}
                    state={{
                        ...draft,
                        ticker: coin.ticker,
                        name: coin.name ?? "",
                        creatorFee: coin.creatorFeePercent ?? draft.creatorFee,
                    }}
                    onSave={(updates) => {
                        // `updates` last: it carries the edited ticker/name, and
                        // seeding from the row is only a fallback for fields the
                        // dialog didn't touch.
                        const next = { ...draft, ticker: coin.ticker, name: coin.name ?? "", ...updates };
                        setDraft(next);
                        void saveDraft(next);
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
