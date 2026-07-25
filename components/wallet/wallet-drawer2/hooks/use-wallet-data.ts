"use client";

import * as React from "react";
import { useAtomValue } from "jotai";
import { keepPreviousData } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc/client";
import { Token, NFT, TabId, NFTCollection } from "../types";
import type { ChainId } from "@/lib/chains/types";
import { getChainOrDefault } from "@/lib/chains/registry";
import { hideSmallBalancesAtom, hideUnknownTokensAtom, hideReportedActivityAtom } from "../store/wallet-settings";


interface UseWalletDataProps {
    walletAddress?: string;
    open?: boolean;
    activeTab: TabId;
    activeChain: ChainId;
}

export function useWalletData({ walletAddress, open, activeTab, activeChain }: UseWalletDataProps) {
    // Solana keeps the Helius pipeline (NFTs, spam filtering, hidden tokens).
    // Every other chain reads from lib/chains/assets via getChainAssets.
    const isSolana = activeChain === "solana";
    const enabled = !!open && !!walletAddress && isSolana;
    // Addresses are stored per KIND — all five EVM chains share one.
    const chainKind = getChainOrDefault(activeChain).kind;

    // Every derived address, so receive/send can show the right one per chain.
    const { data: chainAddresses } = trpc.wallet.getChainAddresses.useQuery(undefined, {
        enabled: !!open,
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
    });

    const { data: chainAssets, isLoading: isLoadingChainAssets, refetch: refetchChainAssets } =
        trpc.wallet.getChainAssets.useQuery(
            { chain: activeChain },
            {
                enabled: !!open && !isSolana,
                refetchInterval: !!open && !isSolana ? 30000 : false,
                staleTime: 30000,
                gcTime: 5 * 60 * 1000,
                placeholderData: keepPreviousData,
                retry: 1,
            }
        );

    const hideSmallBalances = useAtomValue(hideSmallBalancesAtom);
    const hideUnknownTokens = useAtomValue(hideUnknownTokensAtom);
    const hideReportedActivity = useAtomValue(hideReportedActivityAtom);

    const trpcContext = trpc.useUtils();
    const { mutateAsync: toggleNftPinMutation } = trpc.wallet.toggleNftPin.useMutation({
        onSuccess: () => {
            // Re-fetch NFTs to reflect the updated pin DB state
            trpcContext.wallet.getNfts.invalidate();
        }
    });

    const togglePin = React.useCallback(async (nft: NFT) => {
        // Optimistically update UI could go here, for now rely on fast invalidation
        const collectionId = nft.collectionId || nft.collectionName;
        
        try {
            await toggleNftPinMutation({
                mint: nft.mint,
                collectionId: collectionId,
                pin: !nft.isPinned // Toggle the current state
            });
        } catch (error) {
            console.error("Failed to toggle pin state", error);
        }
    }, [toggleNftPinMutation]);

    const {
        data: assetData,
        isLoading: isLoadingTokens,
        refetch: refresh,
    } = trpc.wallet.getWalletAssets.useQuery(
        { address: walletAddress ?? "" },
        {
            enabled,
            refetchInterval: enabled ? 15000 : false,
            staleTime: 15000,
            gcTime: 5 * 60 * 1000,
            placeholderData: keepPreviousData,
            retry: 1,
        }
    );

    const { data: transactions, isLoading: isLoadingActivity } = trpc.wallet.getTransactions.useQuery(undefined, {
        enabled: enabled && activeTab === "activity",
        refetchInterval: 30000,
        staleTime: 30000,
        gcTime: 5 * 60 * 1000,
        placeholderData: keepPreviousData,
    });

    const { data: nftsData, isLoading: isLoadingNfts, refetch: refreshNfts } = trpc.wallet.getNfts.useQuery(undefined, {
        enabled: enabled && activeTab === "nfts",
        refetchInterval: 30000,
        staleTime: 30000,
        gcTime: 5 * 60 * 1000,
        placeholderData: keepPreviousData,
    });

    const { mutateAsync: toggleHideTokenMutation } = trpc.wallet.toggleHideToken.useMutation({
        onSuccess: () => trpcContext.wallet.getWalletAssets.invalidate(),
    });

    const toggleHideToken = React.useCallback(async (mint: string, hidden: boolean) => {
        try { await toggleHideTokenMutation({ mint, hidden }); }
        catch (error) { console.error("Failed to toggle token visibility", error); }
    }, [toggleHideTokenMutation]);

    const { mutateAsync: toggleHideCollectionMutation } = trpc.wallet.toggleHideCollection.useMutation({
        onSuccess: () => trpcContext.wallet.getNfts.invalidate(),
    });

    const { mutateAsync: reportSpamNftMutation } = trpc.wallet.reportSpamNft.useMutation({
        onSuccess: () => trpcContext.wallet.getNfts.invalidate(),
    });

    const { mutateAsync: reportSpamTransactionMutation } = trpc.wallet.reportSpamTransaction.useMutation({
        onSuccess: () => trpcContext.wallet.getTransactions.invalidate(),
    });

    const toggleHideCollection = React.useCallback(async (collectionId: string, hidden: boolean) => {
        try { await toggleHideCollectionMutation({ collectionId, hidden }); }
        catch (error) { console.error("Failed to toggle collection visibility", error); }
    }, [toggleHideCollectionMutation]);

    const reportSpam = React.useCallback(async (mint: string) => {
        try { await reportSpamNftMutation({ mint }); }
        catch (error) { console.error("Failed to report spam NFT", error); }
    }, [reportSpamNftMutation]);

    const reportSpamTransaction = React.useCallback(async (signature: string) => {
        try { await reportSpamTransactionMutation({ signature }); }
        catch (error) { console.error("Failed to report spam transaction", error); }
    }, [reportSpamTransactionMutation]);

    const allTokens: Token[] = assetData?.tokens ?? [];
    const hiddenTokenMints: string[] = assetData?.hiddenTokenMints || [];
    const solPrice = assetData?.solPrice ?? null;

    const SOL_MINT = "So11111111111111111111111111111111111111111";
    const hiddenTokenSet = new Set(hiddenTokenMints);
    let tokens: Token[] = allTokens.filter(t => !hiddenTokenSet.has(t.mint));

    if (hideSmallBalances) {
        tokens = tokens.filter(t => t.mint === SOL_MINT || (t.usdValue ?? 0) >= 1);
    }
    if (hideUnknownTokens) {
        tokens = tokens.filter(t => t.symbol !== "UNKNOWN" && t.name !== "Unknown Token");
    }

    const solToken = tokens.find(t => t.mint === "So11111111111111111111111111111111111111111");
    const balance = solToken?.balance ?? null;

    const totalUsdBalance = tokens.reduce((sum, t) => sum + (t.usdValue || 0), 0);

    const nfts = (nftsData?.nfts || []) as NFT[];
    const hiddenCollectionIds: string[] = (nftsData?.hiddenCollections || []) as string[];
    
    // Group NFTs by collection
    const collections = React.useMemo(() => {
        const groups: Record<string, NFTCollection> = {};
        
        nfts.forEach(nft => {
            const collectionId = nft.collectionId || nft.collectionName || 'unknown';
            // For the collection's pinned status, we check if ANY item in it is pinned
            // The backend getNfts logic sets isPinned=true for the NFT if its collection is pinned
            // so we can reliably check the first item. We also use the NFT's own isPinned.
            const isPinnedNft = nft.isPinned || false;
            
            if (!groups[collectionId]) {
                groups[collectionId] = {
                    id: collectionId,
                    name: nft.collectionName || 'Unknown Collection',
                    image: nft.image, // Use the first NFT as collection cover
                    count: 0,
                    items: [],
                    isPinned: isPinnedNft, // Will become true if any item pushes it to true later
                };
            } else if (isPinnedNft) {
                // If this specific NFT is pinned, ensure the collection visually inherits the pinned status
                groups[collectionId].isPinned = true;
            }
            
            groups[collectionId].items.push({ ...nft, isPinned: isPinnedNft });
            groups[collectionId].count++;
        });

        // Sort items within each collection: pinned first
        Object.values(groups).forEach(group => {
            group.items.sort((a, b) => {
                if (a.isPinned && !b.isPinned) return -1;
                if (!a.isPinned && b.isPinned) return 1;
                return 0;
            });
        });

        // Sort collections: pinned first, then by count
        return Object.values(groups).sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return b.count - a.count;
        });
    }, [nfts]);

    const filteredTransactions = React.useMemo(() => {
        if (!transactions) return transactions;
        if (!hideReportedActivity) return transactions;
        return transactions.filter((tx: (typeof transactions)[number]) => !tx.isSpam);
    }, [transactions, hideReportedActivity]);

    // Non-Solana chains. Placed after every hook above so hook order stays
    // stable when the user switches networks.
    if (!isSolana) {
        const chainTokens: Token[] = (chainAssets?.assets ?? []).map((a) => ({
            // Native coins have no contract — synthesize a stable key so list
            // rendering and selection still work.
            mint: a.contract ?? `native:${a.chain}`,
            symbol: a.symbol,
            name: a.name,
            icon: a.icon,
            balance: a.balance,
            price: a.price,
            usdValue: a.usdValue,
            priceChange24h: a.priceChange24h,
            decimals: a.decimals,
        }));
        const native = (chainAssets?.assets ?? []).find((a) => a.isNative);

        return {
            solPrice: native?.price ?? null,
            balance: native?.balance ?? null,
            totalUsdBalance: chainAssets?.totalUsd ?? 0,
            priceData: [] as { timestamp: number; price: number }[],
            tokens: chainTokens,
            allTokens: chainTokens,
            isLoadingTokens: isLoadingChainAssets,
            // NFTs and activity are Solana-only for now — see tasks 8/9.
            nfts: [] as NFT[],
            collections: [] as NFTCollection[],
            isLoadingNfts: false,
            transactions: [] as typeof transactions,
            isLoadingActivity: false,
            refresh: () => { refetchChainAssets(); },
            togglePin,
            toggleHideCollection,
            toggleHideToken,
            reportSpam,
            reportSpamTransaction,
            hiddenCollectionIds: [] as string[],
            hiddenTokenMints: [] as string[],
            receiveAddress: chainAddresses?.[chainKind] ?? null,
            /** Set when holdings may be incomplete (e.g. no indexer key). */
            partial: chainAssets?.partial,
        };
    }

    return {
        solPrice,
        balance,
        totalUsdBalance,
        priceData: [] as { timestamp: number; price: number }[],
        tokens,
        allTokens,
        isLoadingTokens,
        nfts,
        collections,
        isLoadingNfts,
        transactions: filteredTransactions,
        isLoadingActivity,
        refresh: () => { refresh(); refreshNfts(); },
        togglePin,
        toggleHideCollection,
        toggleHideToken,
        reportSpam,
        reportSpamTransaction,
        hiddenCollectionIds,
        hiddenTokenMints,
        receiveAddress: chainAddresses?.solana ?? walletAddress ?? null,
        partial: undefined as { reason: string } | undefined,
    };
}
