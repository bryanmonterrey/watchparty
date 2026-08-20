"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { trpc } from "@/lib/trpc/client";
import { useActiveAddress } from "@/hooks/use-active-wallet";
import { useAuthSession } from "@/hooks/use-auth-session";
import { getRealtimeClient } from "@/lib/supabase/realtime-client";
import { useForceLoading } from "@/lib/debug-loading";

/** Native SOL mint as reported by getWalletAssets (display/balances mint). */
export const SOL_MINT = "So11111111111111111111111111111111111111111";

export type WalletAssetsData = {
    tokens: Array<Record<string, unknown> & { mint: string; balance: number }>;
    solPrice: number;
    hiddenTokenMints: string[];
};

// Last-known assets snapshot, persisted per address. Hydrated back in so the
// header paints the previous balance instantly on load (Phantom-style) while
// the real fetch lands silently.
const snapshotKey = (address: string) => `wallet-assets-snapshot:${address}`;

/**
 * The last assets we saw for an address, from localStorage.
 *
 * Exported because the DRAWER needs the same fallback the header has. Holding
 * it only in memory (as the drawer did) is no fallback at all for a component
 * that mounts when it opens: the header would paint a balance from here while
 * the drawer, opening cold into the same failed query, said "No Coins Found" —
 * two surfaces disagreeing about one wallet.
 */
export function readWalletAssetsSnapshot(address: string | null | undefined): WalletAssetsData | undefined {
    return readSnapshot(address);
}

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

/**
 * Did the server refuse rather than fail? Quota exhaustion and a downed
 * upstream are both answers, not accidents — retrying them adds load to
 * exactly the thing that's already over its limit.
 */
export function isUpstreamRefusal(err: unknown): boolean {
    const code = (err as { data?: { code?: string } } | null)?.data?.code;
    return code === "TOO_MANY_REQUESTS" || code === "SERVICE_UNAVAILABLE";
}

// Longest we'll wait for a remembered extension to hand over its public key
// before falling back to the embedded wallet. Bounded on purpose: an extension
// that never connects (uninstalled since, or an unlock prompt left sitting)
// must not hold the header in its skeleton forever.
const ADAPTER_GRACE_MS = 2000;

/**
 * Whose balance the header is showing.
 *
 * The CONNECTED wallet is the wallet — same rule as the wallet button and the
 * drawer's send view, and all three must agree or the header shows one wallet's
 * balance while the drawer spends from another. The embedded Swig address is
 * the fallback for users with no extension.
 *
 * The subtlety is WHEN to fall back. autoConnect is on, so a returning
 * extension user has `wallet` selected from localStorage for several renders
 * before `publicKey` arrives. Resolving the embedded address in that window
 * pointed the query at a different wallet — empty, for anyone who never funded
 * theirs — so the chip painted 0.000 and then swapped to the extension's real
 * balance a beat later. That is half the reported 0 ↔ balance flicker; the
 * other half is in useHeaderWalletLoading below.
 */
export function useHeaderWalletAddress() {
    const { data: session } = useAuthSession();
    const { publicKey, wallet, connecting } = useWallet();

    const adapterAddress = publicKey?.toBase58();

    // Only a wallet that's actually present can be waited on. A stale name in
    // localStorage for an extension since uninstalled reads as NotDetected and
    // never connects, so it falls straight through to the embedded address.
    const adapterPresent =
        !!wallet &&
        (wallet.readyState === WalletReadyState.Installed ||
            wallet.readyState === WalletReadyState.Loadable);

    const [graceExpired, setGraceExpired] = useState(false);
    useEffect(() => {
        if (adapterAddress || graceExpired || !(connecting || adapterPresent)) return;
        const timer = setTimeout(() => setGraceExpired(true), ADAPTER_GRACE_MS);
        return () => clearTimeout(timer);
    }, [adapterAddress, graceExpired, connecting, adapterPresent]);

    const waitingOnAdapter = !adapterAddress && !graceExpired && (connecting || adapterPresent);

    // The SELECTION ("wallet in use") is authoritative when it exists — the
    // owner's rule is that the balance chip shows the wallet in use, and the
    // buy dialog already spends from it. An EVM selection has no Solana
    // address at all, so it comes back as `selectedEvm` and the Solana address
    // stays undefined — which is exactly the state the EVM chip path keys on.
    // No selection (never opened the picker) keeps the old resolution:
    // connected adapter, then the account's primary mirror.
    const selection = useActiveAddress();
    const selectedEvm = selection?.startsWith("0x") ? selection : null;
    const address = selectedEvm
        ? undefined
        : selection ?? adapterAddress ?? (waitingOnAdapter ? undefined : session?.user?.wallet_address);

    // An explicit selection needs no adapter grace: the address is known now.
    return { address, waitingOnAdapter: selection ? false : waitingOnAdapter, selectedEvm, session };
}

/**
 * One shared loading gate for all three header tiles (balance chip, Create,
 * wallet avatar): session + the first getWalletAssets fetch. Everyone who calls
 * this subscribes to the SAME query cache entry, so all tiles leave their
 * skeletons in the same render pass instead of the avatar landing seconds
 * before the balance.
 *
 * `data` is deliberately not just `query.data`. react-query drops data in more
 * situations than "the wallet is empty" — an error before the first success has
 * no data at all (placeholderData applies only while a query is PENDING, see
 * queryObserver), and so does a moment where the address is unknown. Every one
 * of those rendered `?? 0` upstream as a confident 0.000. So the answer falls
 * back to the last value we actually got for this address, then to the
 * persisted snapshot, and `known` says whether there's any answer at all.
 */
export function useHeaderWalletLoading() {
    // Debug switch (?debug-loading) pins all three tiles into their skeletons.
    const forceLoading = useForceLoading();
    const { isLoading: sessionLoading, isError: sessionError, data: sessionData } = useAuthSession();
    const { address: walletAddress, waitingOnAdapter, selectedEvm, session } = useHeaderWalletAddress();

    // An errored session read that never produced an answer is UNKNOWN, not
    // signed-out. data stays undefined only when no request has ever succeeded
    // (a later error keeps the previous answer) — so this holds the skeleton
    // through a failed first load instead of flipping the tiles to their
    // signed-out states while use-auth-session's error interval retries.
    const sessionUnknown = sessionError && sessionData === undefined;

    const query = trpc.wallet.getWalletAssets.useQuery(
        { address: walletAddress ?? "" },
        {
            enabled: !!walletAddress,
            staleTime: 60_000,
            // The interval is a SAFETY NET, not the update path. Balances move
            // when a transaction touches the wallet, and the Helius webhook
            // says so within seconds (subscribeAssetsChanged below) — polling
            // every 60 s on top of that spent the key to keep already-current
            // numbers current. Window focus still refetches.
            refetchInterval: 5 * 60_000,
            // Retry a transient blip, but never a refusal: "we're out of quota"
            // and "the upstream is down" don't become true on the third ask,
            // and retrying is how a dead key gets hammered hardest.
            retry: (count, err) => !isUpstreamRefusal(err) && count < 2,
        },
    );

    // Last answer we actually got, per address. Held across errors and address
    // churn so the UI never has to invent one.
    const lastGood = useRef<{ address: string; data: WalletAssetsData } | null>(null);
    if (walletAddress && query.data) {
        lastGood.current = { address: walletAddress, data: query.data as unknown as WalletAssetsData };
    }

    const snapshot = useMemo(() => readSnapshot(walletAddress), [walletAddress]);
    const held = lastGood.current;
    // Both sides have to be a real address: `held?.address === walletAddress`
    // alone is TRUE when there's nothing held and no wallet — undefined on both
    // sides — which would hand back another wallet's balance.
    const heldData = held && walletAddress && held.address === walletAddress ? held.data : undefined;
    const data = (query.data as unknown as WalletAssetsData | undefined) ?? heldData ?? snapshot;

    // Persist the latest real result for next visit's instant paint.
    useEffect(() => {
        if (walletAddress && query.data) writeSnapshot(walletAddress, query.data as unknown as WalletAssetsData);
    }, [walletAddress, query.data]);

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

    const known = !!data;

    // An account whose only wallet is an external EVM one has NO Solana address,
    // so the query above stays disabled and every tile would render "0.000 SOL"
    // for a wallet that is not Solana and has no SOL. getActiveWallet answers
    // what the wallet actually IS. Only asked when there is no Solana address to
    // show, so a Solana user never pays for it.
    const activeQuery = trpc.wallet.getActiveWallet.useQuery(
        // The selected EVM wallet, when that is what's in use — the server
        // resolves ITS value chain and balance, not the primary's.
        { address: selectedEvm ?? undefined },
        {
            enabled: !sessionLoading && !sessionUnknown && !waitingOnAdapter && !walletAddress && !!sessionData?.user,
            staleTime: 60_000,
        },
    );
    // `isPending` is true for a DISABLED query too, so fetchStatus is what
    // distinguishes "in flight" from "never asked" — without it the chip would
    // hold its skeleton forever for a signed-out visitor.
    const activeLoading = activeQuery.isPending && activeQuery.fetchStatus !== "idle";

    return {
        // No wallet linked → the query stays disabled and the tiles render
        // their signed-out states as soon as the session resolves.
        loading:
            forceLoading ||
            sessionLoading ||
            sessionUnknown ||
            waitingOnAdapter ||
            (!known && !!walletAddress && query.isPending) ||
            activeLoading,
        data,
        /** Whose balance this is — the drawer must open on the same wallet. */
        address: walletAddress,
        /** There is a wallet to have a balance at all. */
        hasWallet: !!walletAddress,
        /** Something has answered for this wallet — otherwise, don't show a number. */
        known,
        /**
         * The wallet in use when it is NOT a Solana one — an external EVM wallet
         * someone signed in with. Null for the common case, so callers branch on
         * it only after `hasWallet` is false.
         */
        activeWallet: activeQuery.data ?? null,
        session,
    };
}
