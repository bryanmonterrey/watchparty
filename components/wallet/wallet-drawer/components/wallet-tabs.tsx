"use client";

import { motion } from "framer-motion";
import { Coins, Image, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Token, NFT, Transaction, TabId, TabType, NFTCollection } from "../types";
import { TokenListItem } from "./token-list-item";
import { EmptyState } from "./empty-state";
import { CollectionItem } from "./collection-item";
import { TransactionItem } from "./transaction-item";
import { TokenListSkeleton, NftGridSkeleton, ActivityListSkeleton } from "./wallet-skeletons";
import { 
    RestingDotsIcon, 
    ToggleIcon, 
    ViewOffIcon, 
    RefreshIcon 
} from "@/components/icons";
import { GooDropdown } from "@/components/ui/goo-dropdown";

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

                <GooDropdown
                    align="end"
                    width={224}
                    fill="#0a0a0a"
                    panelRadius={24}
                    itemHeight={48}
                    triggerAriaLabel="Wallet options"
                    triggerClassName="p-2 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                    trigger={<RestingDotsIcon className="w-6 h-6" />}
                    items={[
                        ...(activeTab !== "activity"
                            ? [
                                  {
                                      key: "manage",
                                      onClick: () => {
                                          if (activeTab === "tokens") onManageTokens?.();
                                          else if (activeTab === "nfts") onManageCollectibles?.();
                                      },
                                      className: "gap-3 px-4 rounded-full cursor-pointer hover:bg-white/5 group",
                                      label: (
                                          <>
                                              <ToggleIcon className="size-6 text-zinc-500 group-hover:text-white transition-colors shrink-0" />
                                              <span className="text-lg font-medium text-white/90">
                                                  {activeTab === "tokens" ? "Manage Tokens" : "Manage Collectibles"}
                                              </span>
                                          </>
                                      ),
                                  },
                              ]
                            : []),
                        {
                            key: "hide-balances",
                            onClick: onHideBalances,
                            className: "gap-3 px-4 rounded-full cursor-pointer hover:bg-white/5 group",
                            label: (
                                <>
                                    <ViewOffIcon className="size-6 text-zinc-500 group-hover:text-white transition-colors shrink-0" />
                                    <span className="text-lg font-medium text-white/90">
                                        {hideBalances ? "Show Balances" : "Hide Balances"}
                                    </span>
                                </>
                            ),
                        },
                        {
                            key: "refresh",
                            onClick: onRefresh,
                            className: "gap-3 px-4 rounded-full cursor-pointer hover:bg-white/5 group",
                            label: (
                                <>
                                    <RefreshIcon className="size-6 text-zinc-500 group-hover:text-white transition-colors shrink-0" />
                                    <span className="text-lg font-medium text-white/90">Refresh</span>
                                </>
                            ),
                        },
                    ]}
                />
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
                            <TokenListSkeleton />
                        )}
                    </div>
                )}

                {activeTab === "nfts" && (
                    <div className="mb-4 p-5 pt-2">
                        {(isLoadingNfts || debugMode) ? (
                            <NftGridSkeleton />
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
                            <ActivityListSkeleton />
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
