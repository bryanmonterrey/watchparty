"use client";

import { SolanaMarkIcon } from "@/components/icons";
import { SOL_MINT, useHeaderWalletLoading } from "./use-header-wallet";

// The address resolution + assets query used to live here, duplicated verbatim
// in sol-balance-chip.tsx (which the wallet button imports). One copy now, in
// use-header-wallet — re-exported so both import paths keep working.
export { useHeaderWalletLoading } from "./use-header-wallet";

// The wallet drawer lives inside WalletButton; the chip asks it to open via
// this event so the two header siblings stay decoupled.
export const OPEN_WALLET_DRAWER_EVENT = "wallet:open-drawer";

function formatSol(balance: number) {
    if (balance >= 100) return balance.toFixed(1);
    if (balance >= 1) return balance.toFixed(2);
    return balance.toFixed(3);
}

// The chip's SHELL is identical loading or loaded — same h-11 pill, same
// bg-soft-gray-10 fill, same hairline — because that's what's actually true:
// the button exists, only the balance inside it is pending. So the skeleton
// wears the real chip's classes and blanks just the two content slots (the
// Solana mark and the number), which lands the loaded state with no size, color
// or shape pop. Its intrinsic width (~102px) matches a formatted balance, so
// nothing beside it shifts either.
//
// It was h-[52px] against a chip that is h-11 (44px) — the whole header row
// shrank 8px the moment the balance arrived.
//
// Pill = rounded-full with NO Squircle (repo rule for pills).
export function SolBalanceChipSkeleton() {
    return (
        <div
            aria-hidden
            className="flex h-11 items-center gap-2 rounded-full px-5 backdrop-blur-xs"
        >
            {/* Mirrors SolanaMarkIcon's h-3 w-3.5 box, then the balance text. */}
            <div className="h-3 w-3.5 shrink-0 rounded-full shimmer-skeleton" />
            <div className="h-4 w-10 rounded-full shimmer-skeleton" />
        </div>
    );
}

// Header SOL balance: Solana mark + amount. An empty wallet is still a balance,
// so it reads as one — the mark stays and the number is 0.000, rather than the
// chip swapping into a differently-shaped prompt. Hovering an empty chip trades
// the zero for "Deposit", which is the only case where the chip has something to
// say beyond the number. Reads the same getWalletAssets query the wallet button
// prefetches, so it shares that cache entry.
export function SolBalanceChip() {
    const { loading, data, hasWallet, known } = useHeaderWalletLoading();

    if (loading) return <SolBalanceChipSkeleton />;

    // A wallet whose balance nobody has answered for is NOT a zero balance.
    // Rendering `?? 0` for it is what made the chip flicker down to 0.000 and
    // back: a transient upstream failure now reaches the client as an error,
    // and an errored query carries no data. An em dash says "don't know", which
    // is the truth, and it's the same width class as the number so nothing
    // shifts when the retry lands.
    const balance = known ? (data?.tokens?.find((t) => t.mint === SOL_MINT)?.balance ?? 0) : hasWallet ? null : 0;
    const isEmpty = balance !== null && balance <= 0;

    return (
        <button
            type="button"
            aria-label={
                balance === null
                    ? "Wallet balance unavailable"
                    : isEmpty
                      ? "Deposit"
                      : `Wallet balance ${formatSol(balance)} SOL`
            }
            onClick={() => window.dispatchEvent(new Event(OPEN_WALLET_DRAWER_EVENT))}
            className="group flex h-11 inner-shadow inner-shadow-blur-sm inner-shadow-white/50 cursor-pointer flex items-center bg-soft-gray-10 hover:bg-soft-gray-15 rounded-full border-sidebar-hover/10 border cursor-pointer items-center gap-2 rounded-full px-5 backdrop-blur-xs transition-colors ease-out"
        >
            <SolanaMarkIcon className="h-3 w-3.5 shrink-0" />
            <span className="text-sm font-semibold text-flexwhite/90 hover:text-white/95">
                {balance === null ? (
                    <span className="text-flexwhite/50">—</span>
                ) : isEmpty ? (
                    // Swapped in CSS, not state — no re-render, and the label is
                    // in the DOM either way for the accessible name above.
                    <>
                        <span className="group-hover:hidden">{formatSol(0)}</span>
                        <span className="hidden group-hover:inline">Deposit</span>
                    </>
                ) : (
                    formatSol(balance)
                )}
            </span>
        </button>
    );
}
