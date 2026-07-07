"use client";

import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
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

// One shared loading gate for all three header tiles (balance chip, Create,
// wallet avatar): session + the first getWalletAssets fetch. Everyone who
// calls this subscribes to the SAME query cache entry, so all tiles leave
// their skeletons in the same render pass instead of the avatar landing
// seconds before the balance. isLoading only covers the initial fetch —
// background refetches (60s interval) don't re-skeleton anything.
export function useHeaderWalletLoading() {
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

    // No wallet linked → query stays disabled (isLoading false), tiles render
    // their signed-out states as soon as the session resolves.
    return { loading: sessionLoading || isLoading, data, session };
}

// Header SOL balance: Solana mark + amount; at zero balance it becomes an
// "Add money" prompt in the Solana gradient. Reads the same getWalletAssets
// query the wallet button prefetches, so it shares that cache entry.
export function SolBalanceChip() {
    const { loading, data } = useHeaderWalletLoading();

    if (loading) return <SolBalanceChipSkeleton />;

    const balance = data?.tokens?.find((t) => t.mint === SOL_MINT)?.balance ?? 0;

    return (
        <button
            type="button"
            aria-label={balance > 0 ? `Wallet balance ${formatSol(balance)} SOL` : "Add money"}
            onClick={() => window.dispatchEvent(new Event(OPEN_WALLET_DRAWER_EVENT))}
            className="flex h-11 cursor-pointer items-center gap-2 rounded-full border-none bg-[#6A6A6A]/35 px-3.5 backdrop-blur-xs transition-colors hover:bg-[#6A6A6A]/50"
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
    );
}
