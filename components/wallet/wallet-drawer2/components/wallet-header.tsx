"use client";

import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown } from "lucide-react";
import {
    SettingsIcon, PowerIcon, WalletIcon, CopyIcon, LogoutIcon,
    VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon,
} from "@/components/icons";
import { appToast } from "@/components/app-ui/app-toast";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import {
    MorphPopover,
    MorphPopoverContent,
    MorphPopoverTrigger,
} from "@/components/motion/popover-morph";
import { useDeviceSessions, MAX_DEVICE_ACCOUNTS } from "@/hooks/use-device-sessions";
import { useAuthSession } from "@/hooks/use-auth-session";

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
            {loading ? (
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full shimmer-skeleton" />
                    <div className="flex flex-col gap-1.5">
                        <div className="h-4 w-24 rounded-full shimmer-skeleton" />
                        <div className="h-3 w-32 rounded-full shimmer-skeleton" />
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
                            className={`-ml-2 flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl px-2 py-1.5 transition-colors ${accountOpen ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}
                        >
                            <Avatar className="h-10 w-10 shrink-0">
                                <AvatarImage src={avatarUrl} alt={username} className="object-cover" />
                                <AvatarFallback></AvatarFallback>
                            </Avatar>
                            {/* Username and its badge, no address: the address was
                                the only thing making this two lines, and rendering
                                one is against house rules anyway (Copy Address on
                                the power menu is the functional path). */}
                            <div className="flex min-w-0 items-center gap-1">
                                <p className="truncate text-base font-bold text-white">{username}</p>
                                <VerifiedBadge
                                    tier={activeUser?.verifiedTier}
                                    hidden={activeUser?.hideVerifiedBadge}
                                />
                            </div>
                            <ChevronDown
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
                        {/* Accounts only. The wallet list lived here too and was
                            redundant: switching the primary wallet already has a
                            home in settings, and the panel that answers "who am I"
                            shouldn't also be a wallet manager. */}
                        <p className="px-3 pt-2 pb-1.5 text-xs font-semibold text-zinc-500">
                            accounts
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
                                                    <span className="truncate text-sm font-semibold text-white">
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
                                                    <span className="flex items-center gap-1 text-xs font-medium text-zinc-500">
                                                        <span className="truncate">{handle}</span>
                                                        <VerifiedBadge
                                                            tier={a.user.verifiedTier}
                                                            hidden={a.user.hideVerifiedBadge}
                                                        />
                                                    </span>
                                                )}
                                            </span>
                                            {isActive && <Check className="size-4 shrink-0 text-white" />}
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
                                                className="cursor-pointer rounded-full p-1.5 text-zinc-600 transition-colors hover:text-red-400"
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
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.06] text-lg font-medium text-zinc-400">
                                +
                            </span>
                            <span className="text-sm font-semibold text-white">add an existing account</span>
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
                        {
                            key: "copy",
                            onClick: handleCopyAddress,
                            className: "gap-3 px-4 cursor-pointer text-lg font-medium text-zinc-300 hover:bg-white/5 hover:text-white group",
                            label: (
                                <>
                                    <CopyIcon className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                                    Copy Address
                                </>
                            ),
                        },
                        {
                            key: "change-wallet",
                            onClick: () => onChangeWallet?.(),
                            className: "gap-3 px-4 cursor-pointer text-lg font-medium text-zinc-300 hover:bg-white/5 hover:text-white group",
                            label: (
                                <>
                                    <WalletIcon className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                                    Change Wallet
                                </>
                            ),
                        },
                        {
                            key: "disconnect",
                            onClick: onSignOut,
                            className: "gap-3 px-4 cursor-pointer text-lg font-medium text-red-400/90 hover:bg-red-500/10 hover:text-red-400",
                            // signOut() clears every _multi- cookie, so with
                            // several accounts signed in this is all of them.
                            // Logging out one is in the account switcher.
                            label: (
                                <>
                                    <LogoutIcon className="w-5 h-5 shrink-0" />
                                    {accounts.length > 1 ? "Log out all" : "Disconnect"}
                                </>
                            ),
                        },
                    ]}
                />
            </div>
        </div>
    );
}
