import * as React from "react";
import { Skeleton } from "boneyard-js/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { SettingsIcon, PowerIcon, WalletIcon, CopyIcon, LogoutIcon } from "@/components/icons";
import { shortenWalletAddress } from "@/lib/utils";
import { appToast } from "@/components/app-ui/app-toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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

    return (
        <div className="flex items-center justify-between px-5 pt-5 bg-gray1 relative">
            <div className="flex items-center gap-3 rounded-xl">
                <div className="rounded-full overflow-hidden h-10 w-10 shrink-0">
                    <Skeleton name="wallet-header-avatar" loading={!!loading}>
                        <Avatar className="h-10 w-10">
                            <AvatarImage src={avatarUrl} alt={username} className="object-cover" />
                            <AvatarFallback></AvatarFallback>
                        </Avatar>
                    </Skeleton>
                </div>
                <div className="flex flex-col">
                    {loading ? (
                        <>
                            <Skeleton name="wallet-header-name" loading>
                                <div className="h-4 w-24 rounded-full bg-zinc-700/10" />
                            </Skeleton>
                            <Skeleton name="wallet-header-address" loading>
                                <div className="h-3 w-32 rounded-full bg-zinc-700/10" />
                            </Skeleton>
                        </>
                    ) : (
                        <>
                            <p className="text-lg font-semibold text-white">{username}</p>
                            <p className="text-sm font-medium text-zinc-400">{shortenWalletAddress(walletAddress || "")}</p>
                        </>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 relative">
                <Button
                    className="size-9 p-0 glass-ring rounded-full bg-black hover:bg-black/50 transition-colors"
                    onClick={onSettingsClick}
                >
                    <SettingsIcon className="w-5 h-5 text-zinc-400" />
                </Button>

                <Popover open={isOpen} onOpenChange={setIsOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            className={`size-9 p-0 glass-ring rounded-full transition-colors ${isOpen ? "bg-zinc-700/70 text-white" : "bg-black hover:bg-black/50 text-zinc-400"}`}
                        >
                            <PowerIcon className="w-5 h-5" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent
                        align="end"
                        sideOffset={8}
                        className="w-52 bg-neutral-950 border-flexborder/75 rounded-3xl shadow-3xl p-1.5 overflow-hidden flex flex-col gap-1"
                    >
                        <button
                            onClick={handleCopyAddress}
                            className="w-full flex items-center px-4 py-2.5 text-lg font-medium text-zinc-300 hover:bg-white/5 hover:text-white rounded-full cursor-pointer transition-colors text-left group gap-3"
                        >
                            <CopyIcon className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                            Copy Address
                        </button>
                        <button
                            onClick={() => {
                                onChangeWallet?.();
                                setIsOpen(false);
                            }}
                            className="w-full flex items-center px-4 py-2.5 text-lg font-medium text-zinc-300 hover:bg-white/5 hover:text-white rounded-full cursor-pointer transition-colors text-left group gap-3"
                        >
                            <WalletIcon className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0" />
                            Change Wallet
                        </button>
                        <button
                            onClick={() => {
                                onSignOut();
                                setIsOpen(false);
                            }}
                            className="w-full flex items-center px-4 py-2.5 text-lg font-medium text-red-400/90 hover:bg-red-500/10 hover:text-red-400 rounded-full cursor-pointer transition-colors text-left gap-3"
                        >
                            <LogoutIcon className="w-5 h-5 shrink-0" />
                            Disconnect
                        </button>
                    </PopoverContent>
                </Popover>
            </div>
        </div>
    );
}
