"use client";

import { BaseSquareIcon, EthDiamondIcon, SolanaMarkIcon } from "@/components/icons";
import { SOL_MINT, useHeaderWalletLoading } from "./use-header-wallet";

// The address resolution + assets query used to live here, duplicated verbatim
// in sol-balance-chip.tsx (which the wallet button imports). One copy now, in
// use-header-wallet — re-exported so both import paths keep working.
export { useHeaderWalletLoading } from "./use-header-wallet";

// The wallet drawer lives inside WalletButton; the chip asks it to open via
// this event so the two header siblings stay decoupled.
export const OPEN_WALLET_DRAWER_EVENT = "wallet:open-drawer";

// One class string for both chips. They are the same control showing a
// different chain's number, and the moment that is duplicated they drift.
const CHIP_CLASS =
    "group flex h-11 inner-shadow inner-shadow-blur-sm inner-shadow-white/50 cursor-pointer flex items-center bg-soft-gray-10 hover:bg-soft-gray-15 rounded-full border-sidebar-hover/10 border cursor-pointer items-center gap-2 rounded-full px-5 backdrop-blur-xs transition-colors ease-out";

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
    const { loading, data, hasWallet, known, activeWallet } = useHeaderWalletLoading();

    if (loading) return <SolBalanceChipSkeleton />;

    // The wallet in use is an external EVM one, so there is no Solana address
    // and no SOL. Rendering the SOL mark at 0.000 here was the bug: it claimed
    // an empty Solana wallet for someone who signed in with Base and holds ETH.
    if (!hasWallet && activeWallet?.chainKind === "evm") {
        return <EvmBalanceChip native={activeWallet.native ?? null} />;
    }

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
            className={CHIP_CLASS}
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

// The EVM twin of the chip above: same shell, the chain's own mark, and its
// native symbol. `native === null` is "asked and don't know" (no indexer key,
// upstream down) and gets the same em dash the Solana side uses — a wallet
// nobody has answered for is not a zero balance.
const BASE_CHAIN_ID = 8453;

function EvmBalanceChip({ native }: { native: { symbol: string; balance: number; chainId?: number } | null }) {
    const balance = native?.balance ?? null;
    const symbol = native?.symbol ?? "ETH";
    const isEmpty = balance !== null && balance <= 0;
    // The ASSET keeps the mark; the CHAIN rides as a badge. ETH held on Base is
    // still ETH, so replacing the diamond with the Base logo would name the
    // wrong thing — it is "ETH on Base", which is what a badge says and a
    // swapped icon does not. Matches the badge geometry in
    // components/wallet/wallet-drawer/components/token-icon.tsx.
    const onBase = native?.chainId === BASE_CHAIN_ID;

    return (
        <button
            type="button"
            aria-label={
                balance === null
                    ? "Wallet balance unavailable"
                    : isEmpty
                      ? "Deposit"
                      : `Wallet balance ${formatSol(balance)} ${symbol}${onBase ? " on Base" : ""}`
            }
            onClick={() => window.dispatchEvent(new Event(OPEN_WALLET_DRAWER_EVENT))}
            className={CHIP_CLASS}
        >
            <span className="relative flex shrink-0 items-center">
                <EthDiamondIcon className="h-4 w-3.5 shrink-0" />
                {onBase && (
                    <span className="absolute -bottom-0.5 -right-1 rounded-full bg-canvas p-[1px] leading-none">
                        <BaseSquareIcon className="block size-2.5 rounded-full" />
                    </span>
                )}
            </span>
            <span className="text-sm font-semibold text-flexwhite/90 hover:text-white/95">
                {balance === null ? (
                    <span className="text-flexwhite/50">—</span>
                ) : isEmpty ? (
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
