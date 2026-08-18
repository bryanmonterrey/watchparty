"use client";

import { motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Coins01Icon, Image01Icon, Activity01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import type { ChainId } from "@/lib/chains/types";
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
import { GooDropdown, gooMenuItem } from "@/components/ui/goo-dropdown";

const TABS: TabType[] = [
    { id: "tokens", name: "Coins" },
    { id: "nfts", name: "Collections" },
    { id: "activity", name: "Activity" },
];

// How many rows the coins tab shows before "All Coins".
const TOP_COUNT = 4;

// Fallback order for rows worth the same — which, on an untouched wallet, is
// every row at $0. Holdings always outrank these; this only decides what an
// empty wallet leads with.
const TOP_CHAINS: ChainId[] = ["solana", "ethereum", "bitcoin", "base"];
const HEADLINE_RANK = new Map<ChainId, number>(TOP_CHAINS.map((c, i) => [c, i]));

function headlineRank(t: Token) {
    if (!isNativeCoin(t)) return Number.MAX_SAFE_INTEGER;
    return HEADLINE_RANK.get((t.chain ?? "solana") as ChainId) ?? TOP_CHAINS.length;
}

// Solana's own coin predates the `native:<chain>` key the EVM/BTC pipeline
// synthesizes for natives — it arrives on the Helius path under the internal
// all-ones mint (SOL_MINT_INTERNAL in server/routers/wallet.ts).
const SOL_NATIVE_MINT = "So11111111111111111111111111111111111111111";

function isNativeCoin(t: Token) {
    return t.mint.startsWith("native:") || t.mint === SOL_NATIVE_MINT;
}

interface WalletTabsProps {
    activeTab: TabId;
    onTabChange: (tabId: TabId) => void;
    tokens: Token[];
    nfts: NFT[];
    collections: NFTCollection[];
    transactions: Transaction[];
    isLoadingTokens: boolean;
    /** No holdings because the upstream is down — say that, don't say "empty". */
    assetsUnavailable?: boolean;
    isLoadingNfts: boolean;
    isLoadingActivity: boolean;
    onTokenClick: (token: Token) => void;
    onNFTClick: (nft: NFT) => void;
    onCollectionClick: (collection: NFTCollection) => void;
    onTransactionClick: (tx: Transaction) => void;
    onRefresh?: () => void;
    onManageCollectibles?: () => void;
    onManageTokens?: () => void;
    onAllTokens?: () => void;
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
    assetsUnavailable,
    isLoadingNfts,
    isLoadingActivity,
    onTokenClick,
    onNFTClick,
    onCollectionClick,
    onTransactionClick,
    onRefresh,
    onManageCollectibles,
    onManageTokens,
    onAllTokens,
    hideBalances,
    onHideBalances,
    debugMode = false,
}: WalletTabsProps) {
    // Biggest holdings first, whatever they are — an SPL/ERC-20 position
    // outranks a chain's own coin. This used to pick the four headline natives
    // by chain, which meant a token you actually held could never reach the
    // tab no matter how large the position.
    //
    // Sorted by USD value, matching the number each row displays. Ties break on
    // headline order, so a wallet where everything is $0 still reads SOL / ETH
    // / BTC / BASE rather than whatever the sort happened to leave on top.
    const topTokens = [...tokens]
        .sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0) || headlineRank(a) - headlineRank(b))
        .slice(0, TOP_COUNT);

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-2 pb-2">
                <div className="flex gap-1 flex-wrap relative">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={cn(
                                "relative z-10 flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-14 font-bold tracking-tight transition-colors",
                                activeTab === tab.id
                                    ? "text-white"
                                    : "text-zinc-500 hover:text-white"
                            )}
                        >
                            {tab.name}
                            {activeTab === tab.id && (
                                <motion.div
                                    layoutId="walletTabHighlight"
                                    className="absolute inset-0 -z-10 rounded-full bg-white/[0.08]"
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
                    triggerAriaLabel="Wallet options"
                    triggerClassName="p-2 text-zinc-500 hover:text-white transition-colors cursor-pointer"
                    trigger={<RestingDotsIcon className="w-6 h-6" />}
                    items={[
                        ...(activeTab !== "activity"
                            ? [
                                  gooMenuItem({
                                      key: "manage",
                                      icon: <ToggleIcon />,
                                      label: activeTab === "tokens" ? "Manage coins" : "Manage collectibles",
                                      onClick: () => {
                                          if (activeTab === "tokens") onManageTokens?.();
                                          else if (activeTab === "nfts") onManageCollectibles?.();
                                      },
                                  }),
                              ]
                            : []),
                        gooMenuItem({
                            key: "hide-balances",
                            icon: <ViewOffIcon />,
                            label: hideBalances ? "Show balances" : "Hide balances",
                            onClick: onHideBalances,
                        }),
                        gooMenuItem({
                            key: "refresh",
                            icon: <RefreshIcon />,
                            label: "Refresh",
                            onClick: onRefresh,
                        }),
                    ]}
                />
            </div>

            <div className="flex-1 overflow-y-auto hidden-scrollbar">
                {activeTab === "tokens" && (
                    <div className="space-y-1 p-5 pt-2">
                        {tokens.length > 0 ? (
                            topTokens.map((token) => (
                                <TokenListItem
                                    // Chain-qualified: the same contract address
                                    // can exist on several EVM chains (CREATE2
                                    // deploys land on identical addresses), so
                                    // the mint alone is not unique here.
                                    key={`${token.chain ?? "solana"}:${token.mint}`}
                                    icon={token.icon}
                                    mint={token.mint}
                                    symbol={token.symbol}
                                    name={token.name}
                                    balance={token.balance}
                                    usdValue={token.usdValue}
                                    priceChange24h={token.priceChange24h}
                                    hideBalances={hideBalances}
                                    chain={token.chain}
                                    // SOL counts too — it has real logo art so
                                    // it keeps its own image, but the flag also
                                    // drops the corner badge, which would just
                                    // repeat the Solana mark on the Solana coin.
                                    isNative={isNativeCoin(token)}
                                    onClick={() => onTokenClick(token)}
                                />
                            ))
                        ) : tokens.length === 0 && !isLoadingTokens ? (
                            // "No coins" is a claim about the WALLET. When the
                            // upstream is down we don't know anything about the
                            // wallet, so saying it would be the same confident
                            // lie the balance chip used to tell with 0.000.
                            assetsUnavailable ? (
                                <EmptyState
                                    icon={<HugeiconsIcon icon={Coins01Icon} className="size-5" strokeWidth={2} />}
                                    title="Balances unavailable"
                                    description="We couldn't reach the network just now. Your coins are safe — refresh in a moment."
                                />
                            ) : (
                                <EmptyState
                                    icon={<HugeiconsIcon icon={Coins01Icon} className="size-5" strokeWidth={2} />}
                                    title="No coins yet"
                                    description="Your coin balances show up here once you hold something."
                                />
                            )
                        ) : (
                            <TokenListSkeleton />
                        )}

                        {/* The rest of the holdings — every other chain's coin
                            plus every SPL/ERC-20 — one tap away. */}
                        {onAllTokens && tokens.length > 0 && (
                            <div className="flex justify-end pt-1">
                                <button
                                    onClick={onAllTokens}
                                    className="flex cursor-pointer items-center gap-1 px-2 py-1.5 text-12 font-semibold text-zinc-500 transition-colors hover:text-white"
                                >
                                    All coins
                                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" strokeWidth={2.5} />
                                </button>
                            </div>
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
                                icon={<HugeiconsIcon icon={Image01Icon} className="size-5" strokeWidth={2} />}
                                title="No collections yet"
                                description="Collectibles in your wallet get grouped here."
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
                                    <p className="px-1.5 text-12 font-semibold text-zinc-500">{group.label}</p>
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
                                icon={<HugeiconsIcon icon={Activity01Icon} className="size-5" strokeWidth={2} />}
                                title="No activity yet"
                                description="Transactions show up here once you start using this wallet."
                            />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
