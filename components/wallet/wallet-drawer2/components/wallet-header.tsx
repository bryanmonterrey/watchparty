"use client";

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import {
    SettingsIcon, PowerIcon, WalletIcon, CopyIcon, LogoutIcon,
    VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon,
} from "@/components/icons";
import { appToast } from "@/components/app-ui/app-toast";
import { GooDropdown, gooMenuItem } from "@/components/ui/goo-dropdown";
import {
    MorphPopover,
    MorphPopoverContent,
    MorphPopoverTrigger,
} from "@/components/motion/popover-morph";
import { useDeviceSessions, MAX_DEVICE_ACCOUNTS } from "@/hooks/use-device-sessions";
import { useAuthSession } from "@/hooks/use-auth-session";
import { trpc } from "@/lib/trpc/client";
import { useWallet } from "@solana/wallet-adapter-react";
import { useActiveWallet, type LinkedWallet } from "@/hooks/use-active-wallet";
import { ChainIcon } from "@/components/wallet/chain-icon";
import { getChain, getChainByEvmId } from "@/lib/chains/registry";
import type { ChainId } from "@/lib/chains/types";
import { shortenWalletAddress } from "@/lib/utils";
import { WalletReadyState } from "@solana/wallet-adapter-base";

/**
 * Same three tiers the watch and home headers render. `hidden` honours the
 * user's own opt-out (hideVerifiedBadge), so an account that suppressed its
 * checkmark everywhere else doesn't get one here.
 */
function VerifiedBadge({ tier, hidden }: { tier?: string | null; hidden?: boolean | null }) {
    if (hidden) return null;
    if (tier === "verified") return <VerifiedBadgeIcon className="size-3.5 shrink-0" />;
    if (tier === "business") return <BusinessBadgeIcon className="size-3.5 shrink-0" />;
    if (tier === "government") return <GovBadgeIcon className="size-3.5 shrink-0" />;
    return null;
}

interface WalletHeaderProps {
    username: string;
    avatarUrl: string;
    walletAddress?: string;
    onSettingsClick: () => void;
    onChangeWallet?: () => void;
    onSignOut: () => void;
    loading?: boolean;
}

/**
 * Which chain's mark a wallet row wears.
 *
 * The row answers "what wallet is this", so it uses the chain the wallet SIGNED
 * IN on — not where its money currently sits, which is the balance chip's
 * question and has its own resolution. A Base sign-in therefore shows Base.
 *
 * Degrades deliberately rather than guessing:
 *  - a recorded chain id wins (8453 -> Base, 1 -> Ethereum)
 *  - otherwise the kind's generic mark, because rows created before chain_id
 *    existed cannot be backfilled — one secp256k1 address is the same account
 *    on every EVM chain, so nothing about the row reveals its origin. They fill
 *    in as people sign in again, and a generic EVM mark beats a wrong one.
 *  - the generated wallet gets NO mark: it holds an address on every chain, so
 *    naming one would be a lie.
 */
function walletChainId(w: LinkedWallet): ChainId | null {
    if (w.source === "swig" || w.chainKind === null) return null;
    if (w.chainId) {
        const chain = getChainByEvmId(w.chainId);
        if (chain) return chain.id;
    }
    if (w.chainKind === "evm") return "ethereum";
    if (w.chainKind === "solana") return "solana";
    return null;
}

export function WalletHeader({
    username,
    avatarUrl,
    walletAddress,
    onSettingsClick,
    onChangeWallet,
    onSignOut,
    loading,
}: WalletHeaderProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [accountOpen, setAccountOpen] = React.useState(false);

    // Every account signed in on this device (better-auth multiSession). Nothing
    // is fetched until the panel opens.
    const { data: session } = useAuthSession();
    const activeUserId = session?.user?.id;
    const activeUser = session?.user as
        | { verifiedTier?: string | null; hideVerifiedBadge?: boolean | null }
        | undefined;
    const { accounts, setActive, revoke, atCapacity } = useDeviceSessions(accountOpen);

    // WALLET IN USE — deliberately NOT the main wallet.
    //
    // This switch changes which wallet the drawer shows and spends from, and
    // nothing else. It drives the wallet adapter, so it writes nothing and has
    // no consequence to anyone but the person tapping it.
    //
    // It must never call setPrimaryWallet. `user.wallet_address` is the MAIN
    // wallet: escrow resolves revenue splits to it (server/routers/escrow.ts),
    // it's the escrow receiver, and it's exposed on every post and user shape
    // other people read. Moving it redirects where money arrives, which is a
    // deliberate settings decision (see components/wallet/linked-wallets-panel),
    // not a tap in a popover next to an avatar.
    //
    // Reading the adapter also keeps this consistent by construction with the
    // balance (wallet-button, sol-balance-chip2) and with send, which all
    // resolve the connected adapter first.
    const {
        wallets: adapterWallets,
        wallet: activeAdapter,
        publicKey: adapterPublicKey,
        select,
        disconnect,
        connecting,
    } = useWallet();

    // THE ACCOUNT'S OWN WALLETS, not the browser's.
    //
    // This list used to be `adapterWallets` filtered to installed — i.e. every
    // extension present in the browser, whether or not it had anything to do
    // with this account. That answers "what could I connect", which is a
    // different question from "which of my wallets am I using", and it showed
    // Phantom to someone who had never linked a Phantom wallet.
    //
    // `linked_wallets` is the real answer and already includes the embedded
    // Swig wallet, so one source covers the whole list — the hardcoded
    // "Watchparty wallet" row is gone with it.
    const { wallets: linked, active, setActive: setActiveWallet } = useActiveWallet(accountOpen);

    // The chain the ACTIVE EVM wallet actually holds value on — the same
    // resolution the balance chip renders (server/lib/active-wallet.ts ranks
    // the four EVM chains by USD and falls back to the sign-in chain). The
    // active row defers to it so the two surfaces can never disagree while
    // both are on screen: without this, sign in on Ethereum, bridge everything
    // to Base, and the row said Ethereum while the chip said Base — both
    // "correct", reported as a bug. Non-active rows keep the sign-in hint;
    // they have no chip to contradict. Cached server-side, fetched only while
    // the popover is open and only for an EVM active wallet.
    const { data: activeResolved } = trpc.wallet.getActiveWallet.useQuery(undefined, {
        enabled: accountOpen && active?.chainKind === "evm",
        staleTime: 60_000,
    });
    const activeValueChain =
        activeResolved?.native?.chainId != null
            ? getChainByEvmId(activeResolved.native.chainId)?.id ?? null
            : null;
    const adapterAddress = adapterPublicKey?.toBase58() ?? null;

    // Still needed, but only to CONNECT one: an extension wallet can't sign
    // until its extension is connected, and only the browser knows what's here.
    const installedWallets = adapterWallets.filter(
        (w) => w.readyState === WalletReadyState.Installed,
    );
    const usingEmbedded = !adapterPublicKey;

    const handleCopyAddress = () => {
        if (walletAddress) {
            navigator.clipboard.writeText(walletAddress);
            appToast.success("Address copied to clipboard");
            setIsOpen(false);
        }
    };

    return (
        <div className="flex items-center justify-between px-5 pt-5 bg-canvas relative">
            {/* The account row is its own popover — the account switcher, modelled
                on the wallet-card block's account trigger. It is deliberately NOT
                the session menu: those actions stay on the power button.

                MorphPopover rather than GooDropdown here. Goo is the standard for
                menus of rows; this panel has its own header and per-account layout,
                which is what the morph primitive is for. */}
            {/* Skeleton only when the NAME is actually missing.
                `loading` here is the assets query, and this row doesn't render
                assets — the username and avatar arrive with the session, which
                is already resolved by the time the drawer can open. Blanking
                them while balances load skeletoned data we already had.

                Single line, matching the trigger below: the address used to
                make this two, and it was removed (house rule — never render a
                wallet address). The second bar was still here. */}
            {loading && !username ? (
                <div className="-ml-2 flex items-center gap-3 px-2 py-1.5">
                    <div className="h-10 w-10 rounded-full shimmer-skeleton shrink-0" />
                    {/* h-7 is the text-15 line box, the bar is the ink — the row
                        has to stand the same height as what replaces it or the
                        balance below jumps on load. */}
                    <div className="flex h-7 items-center">
                        <div className="h-[18px] w-24 rounded-full shimmer-skeleton" />
                    </div>
                </div>
            ) : (
                <MorphPopover open={accountOpen} onOpenChange={setAccountOpen}>
                    <MorphPopoverTrigger>
                        <button
                            aria-label="Switch account"
                            // -ml-2 pulls the avatar back to the card's content
                            // edge, so it still lines up with the balance below
                            // despite the trigger's own padding.
                            // justify-start is explicit: the name sits against
                            // the avatar and stays there, whatever width the
                            // trigger ends up with.
                            className={`-ml-2 flex min-w-0 cursor-pointer items-center justify-start gap-3 rounded-2xl px-2 py-1.5 transition-colors ${accountOpen ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}
                        >
                            <Avatar className="h-10 w-10 shrink-0">
                                <AvatarImage src={avatarUrl} alt={username} className="object-cover" />
                                <AvatarFallback />
                            </Avatar>
                            {/* Username and its badge, no address: the address was
                                the only thing making this two lines, and rendering
                                one is against house rules anyway (Copy Address on
                                the power menu is the functional path). */}
                            <div className="flex min-w-0 items-center justify-start gap-1 text-left">
                                <p className="truncate text-15 font-bold text-white">{username}</p>
                                <VerifiedBadge
                                    tier={activeUser?.verifiedTier}
                                    hidden={activeUser?.hideVerifiedBadge}
                                />
                            </div>
                            <HugeiconsIcon
                                icon={ArrowDown01Icon}
                                strokeWidth={2.5}
                                className={`size-4 shrink-0 text-zinc-500 transition-transform duration-200 ${accountOpen ? "rotate-180" : ""}`}
                            />
                        </button>
                    </MorphPopoverTrigger>

                    <MorphPopoverContent
                        side="bottom"
                        align="start"
                        radius={24}
                        fill="#111111ff"
                        className="w-[264px] p-1.5"
                    >
                        {/* WALLET IN USE — first, because inside a wallet drawer
                            that's the switch people reach for. Selecting drives
                            the adapter; the embedded wallet is simply "no adapter
                            connected", so switching to it is a disconnect.
                            Nothing here changes the main wallet. */}
                        <p className="px-3 pt-2 pb-1.5 text-11 font-semibold text-zinc-500">
                            Wallet in use
                        </p>
                        <ul>
                            {linked.map((w) => {
                                const isEmbedded = w.source === "swig";
                                const isEvm = w.chainKind === "evm";
                                const isActive = active?.address === w.address;
                                // EXACTLY ONE wallet is in use: the selected
                                // one. This used to be two competing notions —
                                // selection for EVM rows, adapter state for
                                // Solana rows — and they could both be true at
                                // once: select the EVM wallet and no Solana
                                // adapter is connected, so the embedded row
                                // ALSO ticked (usingEmbedded), showing two
                                // wallets "in use". The balance chip and the
                                // buy dialog answer for one wallet, so the
                                // picker must claim one.
                                const inUse = isActive;
                                // Adapter connectivity is a FACT about a Solana
                                // extension row, not a competing in-use claim.
                                // It still drives the "· not connected" label,
                                // the extension's own icon, and whether a click
                                // needs to connect. EVM rows have no adapter
                                // question at all — they sign through the EVM
                                // provider, so selection is their whole story.
                                const adapterMatches =
                                    !isEmbedded && !isEvm && adapterAddress === w.address;
                                const icon = adapterMatches ? activeAdapter?.adapter.icon : undefined;
                                const rowChain =
                                    isActive && isEvm && activeValueChain
                                        ? activeValueChain
                                        : walletChainId(w);
                                return (
                                    <li
                                        key={w.id}
                                        className={`flex items-center rounded-2xl transition-colors ${isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}
                                    >
                                        <button
                                            onClick={() => {
                                                setActiveWallet(w.address);
                                                // An EVM wallet has nothing to
                                                // connect here: the Solana
                                                // adapter does not hold it, and
                                                // falling through would prompt
                                                // "install the extension that
                                                // holds this wallet" for a wallet
                                                // that is already signed in.
                                                if (isEvm) {
                                                    // selection is the action
                                                } else if (isEmbedded && !usingEmbedded) {
                                                    disconnect().catch(() =>
                                                        appToast.error("Couldn't switch wallet"),
                                                    );
                                                } else if (!isEmbedded && !adapterMatches) {
                                                    // We cannot aim a specific
                                                    // extension at a specific
                                                    // address — the user picks
                                                    // the account inside it — so
                                                    // connect and let the match
                                                    // resolve itself.
                                                    const first = installedWallets[0];
                                                    if (first) select(first.adapter.name);
                                                    else
                                                        appToast.error(
                                                            "Install the extension that holds this wallet",
                                                        );
                                                }
                                                setAccountOpen(false);
                                            }}
                                            disabled={connecting}
                                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-left"
                                        >
                                            <span className="relative shrink-0">
                                            {icon ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img
                                                    src={icon}
                                                    alt=""
                                                    className="size-9 shrink-0 rounded-full object-cover"
                                                />
                                            ) : (
                                                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.06]">
                                                    <WalletIcon className="size-4 text-zinc-400" />
                                                </span>
                                            )}
                                            {/* The chain the wallet signed in
                                                on, as a badge rather than a
                                                replacement: the round icon above
                                                is the WALLET, this says which
                                                network it is. Geometry matches
                                                the login card's wallet badges. */}
                                            {rowChain && (
                                                <span
                                                    role="img"
                                                    /* "Base ACCOUNT", not "Base". The chip beside this
                                                       answers a different question — which chain the
                                                       money is on, resolved live — so the two can
                                                       legitimately disagree for one wallet (signed in
                                                       on Base, holds ETH on Ethereum). Naming this one
                                                       as the account stops the pair reading as a bug. */
                                                    aria-label={`${getChain(rowChain)?.name ?? rowChain} account`}
                                                    title={`${getChain(rowChain)?.name ?? rowChain} account`}
                                                    className="absolute -right-1 -bottom-0.5 rounded-full bg-canvas p-[1.5px] leading-none"
                                                >
                                                    <ChainIcon chain={rowChain} size={16} />
                                                </span>
                                            )}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                {/* The ADDRESS identifies the
                                                    wallet — a label cannot, when
                                                    several are "Extension".
                                                    Shortened through the
                                                    canonical helper, which is
                                                    the only place allowed to
                                                    truncate one. */}
                                                <span className="block truncate text-13 font-semibold text-white">
                                                    {shortenWalletAddress(w.address)}
                                                </span>
                                                <span className="flex items-center gap-1.5 text-11 font-medium text-zinc-500">
                                                    {isEmbedded ? "Built in" : "Extension"}
                                                    {w.isPrimary ? (
                                                        <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-11 font-semibold text-zinc-400">
                                                            Main
                                                        </span>
                                                    ) : null}
                                                    {!isEmbedded && !isEvm && !adapterMatches ? (
                                                        <span className="text-zinc-600">· not connected</span>
                                                    ) : null}
                                                </span>
                                            </span>
                                            {inUse && <HugeiconsIcon icon={Tick02Icon} className="size-4 shrink-0 text-white" strokeWidth={3} />}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>

                        {/* The divider is what keeps the two questions separate —
                            without it the lists read as one. */}
                        <div className="mx-3 my-1.5 h-px bg-white/10" />

                        <p className="px-3 pt-2 pb-1.5 text-11 font-semibold text-zinc-500">
                            Accounts
                        </p>
                        <ul>
                            {accounts.map((a) => {
                                const isActive = a.user.id === activeUserId;
                                const handle = a.user.username ? `@${a.user.username}` : a.user.name || "account";
                                return (
                                    <li
                                        key={a.session.token}
                                        className={`flex items-center rounded-2xl pr-1.5 transition-colors ${isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}
                                    >
                                        <button
                                            onClick={() => {
                                                if (isActive) { setAccountOpen(false); return; }
                                                setActive.mutate(a.session.token);
                                            }}
                                            disabled={setActive.isPending}
                                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-left"
                                        >
                                            {/* That account's own avatar, from the
                                                session row — parseUserOutput passes
                                                our additionalFields through, so
                                                avatar_url is already here. */}
                                            <Avatar className="size-9 shrink-0">
                                                <AvatarImage src={a.user.avatar_url ?? undefined} alt={handle} className="object-cover" />
                                                <AvatarFallback />
                                            </Avatar>
                                            {/* The badge follows the username, and
                                                renders exactly once: an account with
                                                no display name has the handle on the
                                                first line, so the second would repeat
                                                it. */}
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1">
                                                    <span className="truncate text-13 font-semibold text-white">
                                                        {a.user.name || handle}
                                                    </span>
                                                    {!a.user.name && (
                                                        <VerifiedBadge
                                                            tier={a.user.verifiedTier}
                                                            hidden={a.user.hideVerifiedBadge}
                                                        />
                                                    )}
                                                </span>
                                                {a.user.name && (
                                                    <span className="flex items-center gap-1 text-11 font-medium text-zinc-500">
                                                        <span className="truncate">{handle}</span>
                                                        <VerifiedBadge
                                                            tier={a.user.verifiedTier}
                                                            hidden={a.user.hideVerifiedBadge}
                                                        />
                                                    </span>
                                                )}
                                            </span>
                                            {isActive && <HugeiconsIcon icon={Tick02Icon} className="size-4 shrink-0 text-white" strokeWidth={3} />}
                                        </button>
                                        {/* Per-account log out. `revoke` drops just this
                                            session; signOut() would clear every account
                                            on the device, which is what Disconnect is
                                            for. */}
                                        {!isActive && (
                                            <button
                                                onClick={() => revoke.mutate(a.session.token)}
                                                disabled={revoke.isPending}
                                                aria-label={`log out ${handle}`}
                                                className="cursor-pointer rounded-full p-1.5 text-zinc-600 transition-colors hover:text-pastelred"
                                            >
                                                <LogoutIcon className="size-4" />
                                            </button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                        <a
                            href="/login?add=1"
                            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors ${atCapacity ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-white/[0.04]"}`}
                            onClick={(e) => {
                                // Past the cap the plugin silently declines to
                                // register the new session, so the sign-in would
                                // "work" and then be invisible here. Refuse instead.
                                if (atCapacity) {
                                    e.preventDefault();
                                    appToast.error(`${MAX_DEVICE_ACCOUNTS} accounts is the limit — log one out first`);
                                }
                            }}
                        >
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-15 font-medium text-zinc-400">
                                +
                            </span>
                            <span className="text-13 font-semibold text-white">Add an existing account</span>
                        </a>

                    </MorphPopoverContent>
                </MorphPopover>
            )}

            <div className="flex items-center gap-1 relative">
                <Button
                    variant="ghost"
                    className="group bg-black hover:bg-input1 text-flexwhite transition-colors rounded-full"
                    onClick={onSettingsClick}
                >
                    {/* size-* (NOT w-/h-): the Button clamps any svg without a
                        `size-` class to size-4 via [&_svg:not([class*='size-'])]:size-4,
                        which is why w-7 h-7 wasn't taking. Change this number to resize.
                        Add `filled` to <SettingsIcon> for the solid gear variant. */}
                    {/* group-hover (not hover): the icon fills transparent gaps, so
                        hovering the Button — marked `group` above — recolors it, not
                        only a direct hover on the gear itself. */}
                    <SettingsIcon filled className="size-6 text-flexwhite/50 group-hover:text-white transition-colors" />
                </Button>

                <GooDropdown
                    open={isOpen}
                    onOpenChange={setIsOpen}
                    align="end"
                    width={208}
                    gap={8}
                    triggerAriaLabel="Wallet session"
                    triggerClassName={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${isOpen ? "bg-input1 text-white" : "bg-black text-flexwhite/50 hover:text-white"}`}
                    trigger={<PowerIcon className="w-6 h-6" strokeWidth={2} />}
                    items={[
                        gooMenuItem({
                            key: "copy",
                            icon: <CopyIcon />,
                            label: "Copy address",
                            onClick: handleCopyAddress,
                        }),
                        gooMenuItem({
                            key: "change-wallet",
                            icon: <WalletIcon />,
                            label: "Change wallet",
                            onClick: () => onChangeWallet?.(),
                        }),
                        gooMenuItem({
                            key: "disconnect",
                            icon: <LogoutIcon />,
                            // signOut() clears every _multi- cookie, so with
                            // several accounts signed in this is all of them.
                            // Logging out one is in the account switcher.
                            label: accounts.length > 1 ? "Log out all" : "Disconnect",
                            variant: "danger",
                            onClick: onSignOut,
                        }),
                    ]}
                />
            </div>
        </div>
    );
}
