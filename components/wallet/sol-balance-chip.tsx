"use client";

import { useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { getRealtimeClient } from "@/lib/supabase/realtime-client";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { SolanaMarkIcon } from "@/components/icons";
import { useForceLoading } from "@/lib/debug-loading";

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

type WalletAssetsData = { tokens: Array<Record<string, unknown> & { mint: string; balance: number }>; solPrice: number; hiddenTokenMints: string[] };

// Last-known assets snapshot, persisted per address. Hydrated back in as
// TanStack placeholderData so the header paints the previous balance
// instantly on load (Phantom-style) while the real fetch lands silently.
const snapshotKey = (address: string) => `wallet-assets-snapshot:${address}`;

function readSnapshot(address: string | null | undefined): WalletAssetsData | undefined {
    if (!address || typeof window === "undefined") return undefined;
    try {
        const raw = window.localStorage.getItem(snapshotKey(address));
        return raw ? (JSON.parse(raw) as WalletAssetsData) : undefined;
    } catch {
        return undefined;
    }
}

function writeSnapshot(address: string, data: WalletAssetsData) {
    try {
        // Slim to what the header needs on first paint — token balances, no
        // icons/metadata bloat, capped — so the entry stays a few KB.
        const slim: WalletAssetsData = {
            tokens: (data.tokens ?? []).slice(0, 25).map((t) => ({
                mint: t.mint,
                symbol: t.symbol,
                name: t.name,
                balance: t.balance,
                decimals: t.decimals,
                price: t.price,
                usdValue: t.usdValue,
            })) as WalletAssetsData["tokens"],
            solPrice: data.solPrice,
            hiddenTokenMints: data.hiddenTokenMints ?? [],
        };
        window.localStorage.setItem(snapshotKey(address), JSON.stringify(slim));
    } catch {
        // storage full/blocked — instant paint is best-effort
    }
}

// Refcounted realtime subscription: useHeaderWalletLoading mounts in three
// header components, but one Supabase client must not join the same topic
// three times — so the first subscriber opens the channel, the rest share it,
// and the last unmount tears it down.
const assetsChannels = new Map<string, { channel: RealtimeChannel; listeners: Set<() => void> }>();

function subscribeAssetsChanged(address: string, listener: () => void): () => void {
    let entry = assetsChannels.get(address);
    if (!entry) {
        const listeners = new Set<() => void>();
        const channel = getRealtimeClient()
            .channel(`wallet-assets:${address}`)
            .on("broadcast", { event: "changed" }, () => listeners.forEach((l) => l()))
            .subscribe();
        entry = { channel, listeners };
        assetsChannels.set(address, entry);
    }
    entry.listeners.add(listener);
    return () => {
        entry.listeners.delete(listener);
        if (entry.listeners.size === 0) {
            getRealtimeClient().removeChannel(entry.channel);
            assetsChannels.delete(address);
        }
    };
}

// One shared loading gate for all three header tiles (balance chip, Create,
// wallet avatar): session + the first getWalletAssets fetch. Everyone who
// calls this subscribes to the SAME query cache entry, so all tiles leave
// their skeletons in the same render pass instead of the avatar landing
// seconds before the balance. A persisted last-known snapshot serves as
// placeholderData, so returning users skip the skeletons entirely and the
// fresh balance swaps in when the fetch lands. isLoading only covers the
// initial no-placeholder fetch — background refetches never re-skeleton.
export function useHeaderWalletLoading() {
    // Debug switch (?debug-loading) pins the tiles into their skeletons. Also
    // needed here, not just in the "2" copy: wallet-button.tsx imports its
    // header-loading gate from THIS module.
    const forceLoading = useForceLoading();
    const { data: session, isLoading: sessionLoading } = useAuthSession();
    const walletAddress = session?.user?.wallet_address;

    const { data, isLoading, isPlaceholderData } = trpc.wallet.getWalletAssets.useQuery(
        { address: walletAddress ?? "" },
        {
            enabled: !!walletAddress,
            staleTime: 30_000,
            refetchInterval: 60_000,
            retry: 1,
            placeholderData: () => readSnapshot(walletAddress),
        },
    );

    // Persist the latest real result for next visit's instant paint.
    useEffect(() => {
        if (walletAddress && data && !isPlaceholderData) writeSnapshot(walletAddress, data as WalletAssetsData);
    }, [walletAddress, data, isPlaceholderData]);

    // Push, don't poll: the Helius assets webhook busts the server cache and
    // broadcasts on this wallet's topic when a tx touches it — refetch right
    // away so deposits/sends appear in seconds, not at the next interval.
    const utils = trpc.useUtils();
    useEffect(() => {
        if (!walletAddress) return;
        return subscribeAssetsChanged(walletAddress, () => {
            utils.wallet.getWalletAssets.invalidate({ address: walletAddress });
        });
    }, [walletAddress, utils]);

    // No wallet linked → query stays disabled (isLoading false), tiles render
    // their signed-out states as soon as the session resolves.
    return { loading: forceLoading || sessionLoading || isLoading, data, session };
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
