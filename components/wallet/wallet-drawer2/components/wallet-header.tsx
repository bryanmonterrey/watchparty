import * as React from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { SettingsIcon, WalletIcon, CopyIcon, LogoutIcon } from "@/components/icons";
import { shortenWalletAddress } from "@/lib/utils";
import { appToast } from "@/components/app-ui/app-toast";
import { GooDropdown } from "@/components/ui/goo-dropdown";

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

    const handleCopyAddress = () => {
        if (walletAddress) {
            navigator.clipboard.writeText(walletAddress);
            appToast.success("Address copied to clipboard");
            setIsOpen(false);
        }
    };

    // The account row IS the trigger, the way the wallet-card block does it:
    // avatar + name + chevron opens the session menu. The session actions used to
    // hang off a separate power button beside Settings, which put them nowhere
    // near the account they act on — and left the account row inert.
    const sessionItems = [
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
            label: (
                <>
                    <LogoutIcon className="w-5 h-5 shrink-0" />
                    Disconnect
                </>
            ),
        },
    ];

    return (
        <div className="flex items-center justify-between px-5 pt-5 bg-canvas relative">
            {loading ? (
                <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full shimmer-skeleton" />
                    <div className="flex flex-col gap-1.5">
                        <div className="h-4 w-24 rounded-full shimmer-skeleton" />
                        <div className="h-3 w-32 rounded-full shimmer-skeleton" />
                    </div>
                </div>
            ) : (
                <GooDropdown
                    open={isOpen}
                    onOpenChange={setIsOpen}
                    align="start"
                    width={232}
                    gap={8}
                    triggerAriaLabel="Wallet session"
                    // -ml-2 pulls the avatar back to the card's content edge, so it
                    // still lines up with the balance below despite the trigger's
                    // own padding.
                    triggerClassName={`-ml-2 flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl px-2 py-1.5 transition-colors ${isOpen ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}
                    trigger={
                        <>
                            <Avatar className="h-10 w-10 shrink-0">
                                <AvatarImage src={avatarUrl} alt={username} className="object-cover" />
                                <AvatarFallback></AvatarFallback>
                            </Avatar>
                            <div className="flex min-w-0 flex-col items-start">
                                <p className="truncate text-base font-bold text-white">{username}</p>
                                <p className="text-xs font-medium text-zinc-400">{shortenWalletAddress(walletAddress || "")}</p>
                            </div>
                            <ChevronDown
                                className={`size-4 shrink-0 text-zinc-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                            />
                        </>
                    }
                    items={sessionItems}
                />
            )}

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
        </div>
    );
}
