"use client";

import { SolanaMarkIcon } from "@/components/icons";
import { SOL_MINT, useHeaderWalletLoading } from "./use-header-wallet";

// The address resolution + assets query moved to use-header-wallet — it was
// duplicated verbatim between this file and sol-balance-chip2.tsx, and the live
// app imports the hook from BOTH (wallet-button here, app-header2 there).
// Re-exported so those import paths keep working.
export { useHeaderWalletLoading } from "./use-header-wallet";

// The wallet drawer lives inside WalletButton; the chip asks it to open via
// this event so the two header siblings stay decoupled.
export const OPEN_WALLET_DRAWER_EVENT = "wallet:open-drawer";

function formatSol(balance: number) {
    if (balance >= 100) return balance.toFixed(1);
    if (balance >= 1) return balance.toFixed(2);
    return balance.toFixed(3);
}

// The chip is a pill (rounded-full, no Squircle — repo rule for pills), so
// its skeleton is the same pill shape; only Create/Wallet are squircles.
// opacity-50 matches those two, which are disabled <Button>s and inherit
// disabled:opacity-50.
export function SolBalanceChipSkeleton() {
    return (
        <div className="flex h-11 w-[92px] items-center justify-center overflow-hidden rounded-full bg-[#6A6A6A]/35 opacity-50 backdrop-blur-xs">
            <div className="size-full shimmer-skeleton" />
        </div>
    );
}

// Header SOL balance: Solana mark + amount; at zero balance it becomes an
// "Add money" prompt in the Solana gradient. Reads the same getWalletAssets
// query the wallet button prefetches, so it shares that cache entry.
export function SolBalanceChip() {
    const { loading, data, hasWallet, known } = useHeaderWalletLoading();

    if (loading) return <SolBalanceChipSkeleton />;

    // Unknown is not zero — see the note in sol-balance-chip2.
    const balance = known ? (data?.tokens?.find((t) => t.mint === SOL_MINT)?.balance ?? 0) : hasWallet ? null : 0;

    return (
        <button
            type="button"
            aria-label={
                balance === null
                    ? "Wallet balance unavailable"
                    : balance > 0
                      ? `Wallet balance ${formatSol(balance)} SOL`
                      : "Add money"
            }
            onClick={() => window.dispatchEvent(new Event(OPEN_WALLET_DRAWER_EVENT))}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-full border-none bg-[#6A6A6A]/35 px-3.5 backdrop-blur-xs transition-colors hover:bg-[#6A6A6A]/50"
        >
            {balance === null ? (
                <>
                    <SolanaMarkIcon className="h-3.5 w-4 shrink-0" />
                    <span className="text-[15px] font-semibold text-white/50">—</span>
                </>
            ) : balance > 0 ? (
                <>
                    <SolanaMarkIcon className="h-3.5 w-4 shrink-0" />
                    <span className="text-[15px] font-semibold text-white">{formatSol(balance)}</span>
                </>
            ) : (
                <span className="text-[15px] font-bold text-flexwhite">Add money</span>
            )}
        </button>
    );
}
