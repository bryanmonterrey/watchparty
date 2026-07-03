"use client";

import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Squircle } from "@/components/ui/squircle";
import { SolanaMarkIcon } from "@/components/icons";

// Native SOL mint as reported by getWalletAssets (display/balances mint).
const SOL_MINT = "So11111111111111111111111111111111111111111";

// The wallet drawer lives inside WalletButton; the chip asks it to open via
// this event so the two header siblings stay decoupled.
export const OPEN_WALLET_DRAWER_EVENT = "wallet:open-drawer";

function formatSol(balance: number) {
    if (balance >= 100) return balance.toFixed(1);
    if (balance >= 1) return balance.toFixed(2);
    return balance.toFixed(3);
}

// rounded-2xl approximates the squircle server-side; Lisse stamps
// data-state="ready" once its clip-path lands, which switches it off so the
// clip is the only shape (see wallet-button-skeleton).
export function SolBalanceChipSkeleton() {
    return (
        <Squircle asChild radius={16} autoEffects={false}>
            <div className="flex h-11 w-[92px] items-center justify-center overflow-hidden rounded-2xl bg-[#6A6A6A]/35 backdrop-blur-xs data-[state=ready]:rounded-none">
                <div className="size-full shimmer-skeleton" />
            </div>
        </Squircle>
    );
}

// Header SOL balance: Solana mark + amount; at zero balance it becomes an
// "Add money" prompt in the Solana gradient. Reads the same getWalletAssets
// query the wallet button prefetches, so it shares that cache entry.
export function SolBalanceChip() {
    const { data: session, isLoading: sessionLoading } = useAuthSession();
    const walletAddress = session?.user?.wallet_address;

    const { data, isLoading } = trpc.wallet.getWalletAssets.useQuery(
        { address: walletAddress ?? "" },
        {
            enabled: !!walletAddress,
            staleTime: 30_000,
            refetchInterval: 60_000,
            retry: 1,
        },
    );

    // Hold the skeleton while the session itself is loading — otherwise the
    // disabled query reports isLoading false and this flashes "Add money"
    // while Create/Wallet are still skeletons. No wallet linked → the query
    // stays disabled and balance resolves to 0, so those users get the
    // "Add money" state; the wallet button routes the click to the connect
    // modal instead of the drawer.
    if (sessionLoading || isLoading) return <SolBalanceChipSkeleton />;

    const balance = data?.tokens?.find((t) => t.mint === SOL_MINT)?.balance ?? 0;

    return (
        <Squircle asChild radius={16} autoEffects={false}>
            <button
                type="button"
                aria-label={balance > 0 ? `Wallet balance ${formatSol(balance)} SOL` : "Add money"}
                onClick={() => window.dispatchEvent(new Event(OPEN_WALLET_DRAWER_EVENT))}
                className="flex h-11 cursor-pointer items-center gap-2 rounded-none border-none bg-[#6A6A6A]/35 px-3.5 backdrop-blur-xs transition-colors hover:bg-[#6A6A6A]/50"
            >
                {balance > 0 ? (
                    <>
                        <SolanaMarkIcon className="h-3.5 w-4 shrink-0" />
                        <span className="text-[15px] font-semibold text-white">{formatSol(balance)}</span>
                    </>
                ) : (
                    <span className="text-[15px] font-bold text-flexwhite">Add money</span>
                )}
            </button>
        </Squircle>
    );
}
