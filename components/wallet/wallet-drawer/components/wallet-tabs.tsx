"use client";

import { motion } from "framer-motion";
import { Coins, Image, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "boneyard-js/react";
import { Token, NFT, Transaction, TabId, TabType, NFTCollection } from "../types";
import { TokenListItem } from "./token-list-item";
import { EmptyState } from "./empty-state";
import { CollectionItem } from "./collection-item";
import { TransactionItem } from "./transaction-item";
import { 
    RestingDotsIcon, 
    ToggleIcon, 
    ViewOffIcon, 
    RefreshIcon 
} from "@/components/icons";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TABS: TabType[] = [
    { id: "tokens", name: "Tokens", icon: Coins },
    { id: "nfts", name: "Collections", icon: Image },
    { id: "activity", name: "Activity", icon: Activity },
];

interface WalletTabsProps {
    activeTab: TabId;
    onTabChange: (tabId: TabId) => void;
    tokens: Token[];
    nfts: NFT[];
    collections: NFTCollection[];
    transactions: Transaction[];
    isLoadingTokens: boolean;
    isLoadingNfts: boolean;
    isLoadingActivity: boolean;
    onTokenClick: (token: Token) => void;
    onNFTClick: (nft: NFT) => void;
    onCollectionClick: (collection: NFTCollection) => void;
    onTransactionClick: (tx: Transaction) => void;
    onRefresh?: () => void;
    onManageCollectibles?: () => void;
    onManageTokens?: () => void;
    hideBalances?: boolean;
    onHideBalances?: () => void;
    debugMode?: boolean;
}

export function WalletTabs({
    activeTab,
    onTabChange,
    tokens,
    nfts,
    collections,
    transactions,
    isLoadingTokens,
    isLoadingNfts,
    isLoadingActivity,
    onTokenClick,
    onNFTClick,
    onCollectionClick,
    onTransactionClick,
    onRefresh,
    onManageCollectibles,
    onManageTokens,
    hideBalances,
    onHideBalances,
    debugMode = false,
}: WalletTabsProps) {
    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-2">
                <div className="flex gap-1 flex-wrap relative">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={cn(
                                "py-1.5 px-3 text-lg font-semibold cursor-pointer rounded-full transition-all relative z-10 flex items-center gap-1.5",
                                activeTab === tab.id
                                    ? "text-white/80"
                                    : "text-zinc-500 hover:text-white hover:bg-zinc-900/65"
                            )}
                        >
                            {tab.name}
                            {activeTab === tab.id && (
                                <motion.div
                                    layoutId="walletTabHighlight"
                                    className="absolute inset-0 bg-gray1 text-white rounded-full -z-10"
                                    initial={false}
                                    transition={{ type: "spring", stiffness: 250, damping: 30 }}
                                />
                            )}
                        </button>
                    ))}
                </div>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <button className="p-2 text-zinc-500 hover:text-white transition-colors cursor-pointer outline-none">
                            <RestingDotsIcon className="w-6 h-6" />
                        </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56 bg-neutral-950 border-flexborder/75 rounded-3xl p-1.5 shadow-3xl">
                        {activeTab !== "activity" && (
                            <DropdownMenuItem
                                onClick={() => {
                                    if (activeTab === "tokens") onManageTokens?.();
                                    else if (activeTab === "nfts") onManageCollectibles?.();
                                }}
                                className="flex items-center justify-start gap-3 py-2.5 px-4 rounded-full cursor-pointer hover:bg-white/5 transition-colors group"
                            >
                                <ToggleIcon className="size-6 text-zinc-500 group-hover:text-white transition-colors shrink-0" />
                                <span className="text-lg font-medium text-white/90">
                                    {activeTab === "tokens" ? "Manage Tokens" : "Manage Collectibles"}
                                </span>
                            </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                            onClick={onHideBalances}
                            className="flex items-center justify-start gap-3 py-2.5 px-4 rounded-full cursor-pointer hover:bg-white/5 transition-colors group"
                        >
                            <ViewOffIcon className="size-6 text-zinc-500 group-hover:text-white transition-colors shrink-0" />
                            <span className="text-lg font-medium text-white/90">
                                {hideBalances ? "Show Balances" : "Hide Balances"}
                            </span>
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                            onClick={onRefresh}
                            className="flex items-center justify-start gap-3 py-2 px-4 rounded-full cursor-pointer hover:bg-white/5 transition-colors group"
                        >
                            <RefreshIcon className="size-6 text-zinc-500 group-hover:text-white transition-colors shrink-0" />
                            <span className="text-lg font-medium text-white/90">Refresh</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="flex-1 overflow-y-auto hidden-scrollbar">
                {activeTab === "tokens" && (
                    <div className="space-y-1 p-5 pt-2">
                        {tokens.length > 0 ? (
                            tokens.map((token) => (
                                <TokenListItem
                                    key={token.mint}
                                    icon={token.icon}
                                    symbol={token.symbol}
                                    name={token.name}
                                    balance={token.balance}
                                    usdValue={token.usdValue}
                                    priceChange24h={token.priceChange24h}
                                    hideBalances={hideBalances}
                                    onClick={() => onTokenClick(token)}
                                />
                            ))
                        ) : tokens.length === 0 && !isLoadingTokens ? (
                            <EmptyState
                                icon={Coins}
                                title="No Tokens Found"
                                description="Your token balances will appear here once you have assets."
                            />
                        ) : (
                            <Skeleton
                                name="wallet-tokens"
                                loading={isLoadingTokens}
                            >
                                <div className="space-y-1">
                                    {(isLoadingTokens
                                        ? [
                                            { mint: "mock1", symbol: "SOL", name: "Solana", balance: 1.5, usdValue: 210.0, priceChange24h: 2.5, decimals: 9 },
                                            { mint: "mock2", symbol: "USDC", name: "USD Coin", balance: 100, usdValue: 100.0, priceChange24h: 0.01, decimals: 6 },
                                            { mint: "mock3", symbol: "USDT", name: "Tether", balance: 50, usdValue: 50.0, priceChange24h: -0.02, decimals: 6 },
                                            { mint: "mock4", symbol: "WBTC", name: "Wrapped Bitcoin", balance: 0.001, usdValue: 95.0, priceChange24h: 1.2, decimals: 8 },
                                            { mint: "mock5", symbol: "JUP", name: "Jupiter", balance: 200, usdValue: 140.0, priceChange24h: -1.5, decimals: 6 },
                                        ] as Token[]
                                        : tokens
                                    ).map((token) => (
                                        <TokenListItem
                                            key={token.mint}
                                            icon={token.icon}
                                            symbol={token.symbol}
                                            name={token.name}
                                            balance={token.balance}
                                            usdValue={token.usdValue}
                                            priceChange24h={token.priceChange24h}
                                            hideBalances={hideBalances}
                                            onClick={() => onTokenClick(token)}
                                        />
                                    ))}
                                </div>
                            </Skeleton>
                        )}
                    </div>
                )}

                {activeTab === "nfts" && (
                    <div className="mb-4 p-5 pt-2">
                        {(isLoadingNfts || debugMode) ? (
                            <div className="grid grid-cols-2 gap-3">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="aspect-square rounded-xl overflow-hidden bg-zinc-900/40 relative">
                                        <Skeleton name="wallet-nft-thumb" loading>
                                            <div className="w-full h-full bg-zinc-800/20" />
                                        </Skeleton>
                                        <div className="absolute inset-x-2 bottom-2 p-2 bg-black/90 backdrop-blur-md rounded-md border border-white/5 flex items-center justify-between">
                                            <Skeleton name="wallet-nft-name" loading>
                                                <div className="h-3 w-20 rounded-full bg-zinc-700/20" />
                                            </Skeleton>
                                            <Skeleton name="wallet-nft-id" loading>
                                                <div className="h-3 w-4 rounded-full bg-zinc-700/20" />
                                            </Skeleton>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : collections.length > 0 ? (
                            <div className="grid grid-cols-2 gap-3">
                                {collections.map((collection) => (
                                    <CollectionItem 
                                        key={collection.id} 
                                        collection={collection} 
                                        onClick={onCollectionClick}
                                    />
                                ))}
                            </div>
                        ) : (
                            <EmptyState
                                icon={Image}
                                title="No Collections Found"
                                description="Collectibles in your wallet will be grouped here."
                            />
                        )}
                    </div>
                )}

                {activeTab === "activity" && (
                    <div className="space-y-1 mb-4 p-5 pt-2">
                        {(isLoadingActivity || debugMode) ? (
                            <Skeleton
                                name="wallet-activity"
                                loading={true}
                            >
                                <div className="space-y-1">
                                    {([
                                        { signature: "m1", type: "TRANSFER", timestamp: Date.now(), amount: 1.5, tokenSymbol: "SOL", isOutgoing: false, status: "success" as const, description: "Received SOL", source: "system" },
                                        { signature: "m2", type: "SWAP", timestamp: Date.now(), amount: 100, tokenSymbol: "USDC", isOutgoing: false, status: "success" as const, description: "Swapped tokens", source: "system" },
                                        { signature: "m3", type: "TRANSFER", timestamp: Date.now(), amount: 0.5, tokenSymbol: "SOL", isOutgoing: true, status: "success" as const, description: "Sent SOL", source: "system" },
                                        { signature: "m4", type: "TRANSFER", timestamp: Date.now(), amount: 2.0, tokenSymbol: "SOL", isOutgoing: false, status: "success" as const, description: "Received SOL", source: "system" },
                                        { signature: "m5", type: "SWAP", timestamp: Date.now(), amount: 50, tokenSymbol: "USDC", isOutgoing: false, status: "success" as const, description: "Swapped tokens", source: "system" },
                                        { signature: "m6", type: "TRANSFER", timestamp: Date.now(), amount: 0.25, tokenSymbol: "SOL", isOutgoing: true, status: "success" as const, description: "Sent SOL", source: "system" },
                                    ] as Transaction[]).map((tx) => (
                                        <TransactionItem
                                            key={tx.signature}
                                            tx={tx}
                                            tokens={tokens}
                                            onClick={() => onTransactionClick(tx)}
                                        />
                                    ))}
                                </div>
                            </Skeleton>
                        ) : transactions && transactions.length > 0 ? (() => {
                            // Group by date
                            const groups: { label: string; txs: typeof transactions }[] = [];
                            for (const tx of transactions) {
                                // Format: Dec 3, 2025
                                const label = new Date(tx.timestamp).toLocaleDateString(undefined, { 
                                    month: 'short', 
                                    day: 'numeric', 
                                    year: 'numeric' 
                                });
                                const existing = groups.find(g => g.label === label);
                                if (existing) existing.txs.push(tx);
                                else groups.push({ label, txs: [tx] });
                            }
                            return groups.map(group => (
                                <div key={group.label} className="space-y-1 pb-4">
                                    <p className="text-md font-semibold text-zinc-400 px-1">{group.label}</p>
                                    {group.txs.map((tx) => (
                                        <TransactionItem
                                            key={tx.signature}
                                            tx={tx}
                                            tokens={tokens}
                                            onClick={() => onTransactionClick(tx)}
                                        />
                                    ))}
                                </div>
                            ));
                        })() : (
                            <EmptyState
                                icon={Activity}
                                title="No Recent Activity"
                                description="Your transaction history will appear here once you start using your wallet."
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
