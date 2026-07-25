"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "motion/react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAtom } from "jotai";
import { activeChainAtom } from "./store/wallet-settings";
import { getChainOrDefault } from "@/lib/chains/registry";

// Types
import { WalletDrawerProps, DrawerView, TabId, Token, NFT, NFTCollection } from "./types";

// Hooks
import { useWalletData } from "./hooks/use-wallet-data";

// Eagerly loaded views (shown on initial open — must be instant)
import { ReceiveView } from "./views/receive";
import { SendView } from "./views/send";
import { BuyView } from "./views/buy";
import { SettingsView } from "./views/settings/SettingsView";
import { AdvancedView } from "./views/settings/AdvancedView";
import { AppDataView } from "./views/settings/AppDataView";
import { BalancesView } from "./views/settings/BalancesView";
import { DeviceKeyView } from "./views/settings/DeviceKeyView";
import { LocalCurrencyView } from "./views/settings/LocalCurrencyView";
import { LanguageView } from "./views/settings/LanguageView";
import { ManageTokensView } from "./views/manage-tokens/manage-tokens-view";
import { NetworkView } from "./views/network/network-view";
import { WalletSetupCta } from "./views/setup/wallet-setup-cta";
import { showNFTSendToast } from "./views/nft-status/nft-send-toast";

// Lazily loaded views (only fetched when user navigates to them)
const SwapView = dynamic(() => import("./views/swap/swap-view").then(m => m.SwapView), { ssr: false });
const TokenDetailView = dynamic(() => import("./views/token-view/TokenView").then(m => m.TokenDetailView), { ssr: false });
const CollectionView = dynamic(() => import("./views/collection/collection-view").then(m => m.CollectionView), { ssr: false });
const NFTDetailView = dynamic(() => import("./views/nft-detail/nft-detail-view").then(m => m.NFTDetailView), { ssr: false });
const SendNFTView = dynamic(() => import("./views/send-nft/send-nft-view").then(m => m.SendNFTView), { ssr: false });
const NFTConfirmSendView = dynamic(() => import("./views/nft-confirm-send/nft-confirm-send-view").then(m => m.NFTConfirmSendView), { ssr: false });
const HideCollectionView = dynamic(() => import("./views/manage-collection/manage-collection-view").then(m => m.HideCollectionView), { ssr: false });
const ActivityView = dynamic(() => import("./views/activity/activity-view").then(m => m.ActivityView), { ssr: false });

// Local Components
import { WalletHeader } from "./components/wallet-header";
import { WalletBalance } from "./components/wallet-balance";
import { WalletActions } from "./components/wallet-actions";
import { WalletTabs } from "./components/wallet-tabs";
import { TransactionDetailsView } from "./views/tx-details/tx-details-view";
import { Transaction as TxType } from "./types";
import type { Token as SwapToken } from "./views/swap/token-selector-modal";
import { trpc } from "@/lib/trpc/client";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { appToast } from "@/components/app-ui/app-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
    createTransferInstruction,
} from "@solana/spl-token";

const viewMotionProps = {
    initial: { x: 16, opacity: 0 },
    animate: { x: 0, opacity: 1 },
    exit: { x: 16, opacity: 0 },
    transition: { type: "tween" as const, duration: 0.1, ease: "easeOut" as const },
};

export function WalletDrawer({
    children,
    username,
    avatarUrl,
    walletAddress,
    onSignOut,
    onChangeWallet,
    open,
    onOpenChange,
}: WalletDrawerProps) {
    const isMobile = useIsMobile();
    const [isOpen, setIsOpen] = React.useState(false);
    // Portal target guard — createPortal needs document (client only).
    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);
    const [activeTab, setActiveTab] = React.useState<TabId>("tokens");
    const [currentView, setCurrentView] = React.useState<DrawerView>("main");
    // Persisted active network. Validated through the registry on read, since a
    // stored id may name a chain we've since removed.
    const [storedChain, setStoredChain] = useAtom(activeChainAtom);
    const activeChain = getChainOrDefault(storedChain).id;
    const [selectedToken, setSelectedToken] = React.useState<Token | null>(null);
    const [selectedTransaction, setSelectedTransaction] = React.useState<TxType | null>(null);
    const [selectedCollection, setSelectedCollection] = React.useState<NFTCollection | null>(null);
    const [selectedNFT, setSelectedNFT] = React.useState<NFT | null>(null);
    const [swapInitialToken, setSwapInitialToken] = React.useState<SwapToken | null>(null);
    const [recipientAddress, setRecipientAddress] = React.useState("");
    const [recipientDisplay, setRecipientDisplay] = React.useState("");
    const [recipientMeta, setRecipientMeta] = React.useState<{ username?: string; name?: string; avatar_url?: string } | undefined>();
    const [isSendingNft, setIsSendingNft] = React.useState(false);
    const [hideBalances, setHideBalances] = React.useState(false);

    const queryClient = useQueryClient();
    const { connection } = useConnection();
    const { publicKey: adapterPublicKey, sendTransaction } = useWallet();
    const { signAndSubmit: signAndSendTxFn } = useWalletSigning();

    const setAvatarMutation = trpc.user.setAvatar.useMutation({
        onMutate: ({ avatar_url }) => {
            queryClient.setQueryData(["session"], (old: any) =>
                old ? { ...old, user: { ...old.user, avatar_url } } : old
            );
            appToast.success("Avatar updated!");
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["session"] });
        },
        onError: () => {
            queryClient.invalidateQueries({ queryKey: ["session"] });
            appToast.error("Failed to update avatar");
        },
    });

    const resolvedOpen = open ?? isOpen;

    const {
        solPrice,
        totalUsdBalance,
        tokens,
        allTokens,
        isLoadingTokens,
        nfts,
        collections,
        isLoadingNfts,
        transactions,
        isLoadingActivity,
        refresh,
        togglePin,
        toggleHideCollection,
        toggleHideToken,
        reportSpam,
        reportSpamTransaction,
        hiddenCollectionIds,
        hiddenTokenMints,
        receiveAddress,
    } = useWalletData({ walletAddress, open: resolvedOpen, activeTab, activeChain });

    const onOpenChangeHandler = (next: boolean) => {
        setIsOpen(next);
        onOpenChange?.(next);
        if (!next) {
            setTimeout(() => {
                setCurrentView("main");
                setActiveTab("tokens");
                setSelectedToken(null);
                setSelectedTransaction(null);
                setSwapInitialToken(null);
                setSelectedNFT(null);
                setSelectedCollection(null);
            }, 300);
        }
    };

    React.useEffect(() => {
        if (!resolvedOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onOpenChangeHandler(false);
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [resolvedOpen]);

    const trigger = children
        ? React.cloneElement(children as React.ReactElement<any>, {
            onClick: () => onOpenChangeHandler(true),
        })
        : null;

    const panelContent = (
        <div className="flex-1 overflow-hidden flex flex-col relative">
            <AnimatePresence mode="wait">
                {currentView === "main" && (
                    <motion.div
                        key="main"
                        {...viewMotionProps}
                        className="flex flex-col h-full overflow-hidden relative"
                    >
                        <WalletHeader
                            username={username}
                            avatarUrl={avatarUrl}
                            walletAddress={walletAddress}
                            onSettingsClick={() => setCurrentView("settings")}
                            onChangeWallet={onChangeWallet}
                            onSignOut={onSignOut}
                            loading={isLoadingTokens}
                            activeChain={activeChain}
                            onNetworkClick={() => setCurrentView("network")}
                        />
                        {!walletAddress ? (
                            <WalletSetupCta />
                        ) : (
                            <>
                                {(() => {
                                    const totalUsdChange24h = tokens.reduce((sum, t) => {
                                        const pct = t.priceChange24h ?? 0;
                                        const val = t.usdValue ?? 0;
                                        const change = (pct !== 0 && pct > -100) ? val - val / (1 + pct / 100) : (pct <= -100 ? -val : 0);
                                        return sum + change;
                                    }, 0);
                                    const prevTotal = totalUsdBalance ? totalUsdBalance - totalUsdChange24h : 0;
                                    const pctChange24h = prevTotal !== 0 ? (totalUsdChange24h / prevTotal) * 100 : 0;
                                    return (
                                        <WalletBalance
                                            totalUsdBalance={totalUsdBalance}
                                            usdChange24h={totalUsdChange24h}
                                            pctChange24h={pctChange24h}
                                            hideBalances={hideBalances}
                                            onToggleHideBalances={() => setHideBalances(false)}
                                            loading={isLoadingTokens}
                                        />
                                    );
                                })()}
                                <WalletActions onNavigate={(view) => setCurrentView(view)} />
                                <WalletTabs
                                    activeTab={activeTab}
                                    onTabChange={setActiveTab}
                                    tokens={tokens}
                                    nfts={nfts}
                                    collections={collections}
                                    transactions={transactions || []}
                                    isLoadingTokens={isLoadingTokens}
                                    isLoadingNfts={isLoadingNfts}
                                    isLoadingActivity={isLoadingActivity}
                                    onRefresh={refresh}
                                    onManageCollectibles={() => setCurrentView("hide-collections")}
                                    hideBalances={hideBalances}
                                    onHideBalances={() => setHideBalances(h => !h)}
                                    onTokenClick={(token) => {
                                        setSelectedToken(token);
                                        setCurrentView("token-detail");
                                    }}
                                    onNFTClick={(nft) => {
                                        setSelectedNFT(nft);
                                        setCurrentView("nft-detail");
                                    }}
                                    onCollectionClick={(collection) => {
                                        if (collection.count === 1 && collection.items[0]) {
                                            setSelectedNFT(collection.items[0]);
                                            setCurrentView("nft-detail");
                                        } else {
                                            setSelectedCollection(collection);
                                            setCurrentView("collection-detail");
                                        }
                                    }}
                                    onTransactionClick={(tx) => {
                                        setSelectedTransaction(tx);
                                        setCurrentView("tx-detail");
                                    }}
                                    onManageTokens={() => setCurrentView("manage-tokens")}
                                />
                            </>
                        )}
                    </motion.div>
                )}

                {currentView === "network" && (
                    <motion.div key="network" {...viewMotionProps} className="h-full">
                        <NetworkView
                            activeChain={activeChain}
                            onSelect={(chain) => {
                                setStoredChain(chain);
                                setCurrentView("main");
                                setActiveTab("tokens");
                            }}
                            onClose={() => setCurrentView("main")}
                        />
                    </motion.div>
                )}

                {currentView === "receive" && (receiveAddress || walletAddress) && (
                    <motion.div key="receive" {...viewMotionProps}>
                        <ReceiveView
                            chain={activeChain}
                            walletAddress={receiveAddress ?? walletAddress!}
                            onBack={() => {
                                setCurrentView("main");
                                setActiveTab("tokens");
                            }}
                            onBuy={() => setCurrentView("buy")}
                        />
                    </motion.div>
                )}

                {currentView === "send" && walletAddress && (
                    <motion.div key="send" {...viewMotionProps}>
                        <SendView
                            walletAddress={walletAddress}
                            tokens={tokens as any}
                            solPrice={solPrice}
                            onBack={() => {
                                setCurrentView("main");
                                setActiveTab("tokens");
                            }}
                        />
                    </motion.div>
                )}

                {currentView === "swap" && walletAddress && (
                    <motion.div key="swap" {...viewMotionProps}>
                        <SwapView
                            walletAddress={walletAddress}
                            walletTokens={tokens}
                            initialInputToken={swapInitialToken ?? undefined}
                            onBack={() => {
                                setSwapInitialToken(null);
                                setCurrentView("main");
                                setActiveTab("tokens");
                            }}
                        />
                    </motion.div>
                )}

                {currentView === "buy" && walletAddress && (
                    <motion.div key="buy" {...viewMotionProps}>
                        <BuyView
                            walletAddress={walletAddress}
                            onBack={() => {
                                setCurrentView("main");
                                setActiveTab("tokens");
                            }}
                        />
                    </motion.div>
                )}

                {currentView === "settings" && (
                    <motion.div key="settings" {...viewMotionProps}>
                        <SettingsView
                            onBack={() => {
                                setCurrentView("main");
                                setActiveTab("tokens");
                            }}
                            onNavigate={(view) => setCurrentView(view as DrawerView)}
                        />
                    </motion.div>
                )}

                {currentView === "advanced" && (
                    <motion.div key="advanced" {...viewMotionProps}>
                        <AdvancedView
                            onBack={() => setCurrentView("settings")}
                            onNavigate={(view) => setCurrentView(view as DrawerView)}
                        />
                    </motion.div>
                )}

                {currentView === "app-data" && (
                    <motion.div key="app-data" {...viewMotionProps}>
                        <AppDataView onBack={() => setCurrentView("advanced")} />
                    </motion.div>
                )}

                {currentView === "balances" && (
                    <motion.div key="balances" {...viewMotionProps}>
                        <BalancesView onBack={() => setCurrentView("settings")} />
                    </motion.div>
                )}

                {currentView === "device-key" && (
                    <motion.div key="device-key" {...viewMotionProps}>
                        <DeviceKeyView onBack={() => setCurrentView("settings")} />
                    </motion.div>
                )}

                {currentView === "currency" && (
                    <motion.div key="currency" {...viewMotionProps}>
                        <LocalCurrencyView onBack={() => setCurrentView("settings")} />
                    </motion.div>
                )}

                {currentView === "language" && (
                    <motion.div key="language" {...viewMotionProps}>
                        <LanguageView onBack={() => setCurrentView("settings")} />
                    </motion.div>
                )}

                {currentView === "token-detail" && selectedToken && (
                    <motion.div key="token-detail" {...viewMotionProps} className="h-full">
                        <TokenDetailView
                            token={selectedToken}
                            tokens={allTokens}
                            onBack={() => setCurrentView("main")}
                            onSend={() => setCurrentView("send")}
                            onReceive={() => setCurrentView("receive")}
                            onSwap={() => setCurrentView("swap")}
                            onBuy={() => setCurrentView("buy")}
                            onSeeActivity={() => setCurrentView("activity")}
                            hideBalances={hideBalances}
                        />
                    </motion.div>
                )}

                {currentView === "activity" && (
                    <motion.div key="activity" {...viewMotionProps} className="h-full">
                        <ActivityView
                            tokens={allTokens}
                            onBack={() => {
                                if (selectedToken) {
                                    setCurrentView("token-detail");
                                } else {
                                    setCurrentView("main");
                                }
                            }}
                            onTransactionClick={(tx) => {
                                setSelectedTransaction(tx);
                                setCurrentView("tx-detail");
                            }}
                            hideBalances={hideBalances}
                        />
                    </motion.div>
                )}

                {currentView === "tx-detail" && selectedTransaction && (
                    <motion.div key="tx-detail" {...viewMotionProps} className="h-full">
                        <TransactionDetailsView
                            transaction={selectedTransaction}
                            walletAddress={walletAddress}
                            tokens={tokens}
                            onSwapWith={(token: Token) => {
                                setSwapInitialToken({
                                    address: token.mint,
                                    symbol: token.symbol,
                                    name: token.name,
                                    decimals: token.decimals ?? 9,
                                    logoURI: token.icon,
                                });
                                setCurrentView("swap");
                            }}
                            onBack={() => setCurrentView("main")}
                            onReportSpam={(signature) => {
                                reportSpamTransaction(signature);
                                setCurrentView("main");
                                setActiveTab("activity");
                            }}
                        />
                    </motion.div>
                )}

                {currentView === "collection-detail" && selectedCollection && (
                    <motion.div key="collection-detail" {...viewMotionProps} className="h-full">
                        <CollectionView
                            collection={selectedCollection}
                            onBack={() => {
                                setSelectedCollection(null);
                                setCurrentView("main");
                                setActiveTab("nfts");
                            }}
                            onNFTClick={(nft) => {
                                setSelectedNFT(nft);
                                setCurrentView("nft-detail");
                            }}
                        />
                    </motion.div>
                )}

                {currentView === "nft-detail" && selectedNFT && (
                    <motion.div key="nft-detail" {...viewMotionProps} className="h-full">
                        <NFTDetailView
                            nft={selectedNFT}
                            onBack={() => {
                                setSelectedNFT(null);
                                if (selectedCollection) {
                                    setCurrentView("collection-detail");
                                } else {
                                    setCurrentView("main");
                                    setActiveTab("nfts");
                                }
                            }}
                            onPin={(nft) => {
                                togglePin(nft);
                                setSelectedNFT(prev => prev ? { ...prev, isPinned: !prev.isPinned } : null);
                            }}
                            onSend={(_nft) => {
                                setCurrentView("send-nft");
                            }}
                            onAvatar={(nft) => {
                                if (!nft.image) return;
                                setAvatarMutation.mutate({ avatar_url: nft.image });
                            }}
                            onReportSpam={(nft) => reportSpam(nft.mint)}
                            onHideCollections={() => setCurrentView("hide-collections")}
                        />
                    </motion.div>
                )}

                {currentView === "send-nft" && selectedNFT && (
                    <motion.div key="send-nft" {...viewMotionProps} className="h-full">
                        <SendNFTView
                            nft={selectedNFT}
                            onBack={() => setCurrentView("nft-detail")}
                            onNext={(addr, display, meta) => {
                                setRecipientAddress(addr);
                                setRecipientDisplay(display);
                                setRecipientMeta(meta);
                                setCurrentView("nft-confirm-send");
                            }}
                        />
                    </motion.div>
                )}

                {currentView === "nft-confirm-send" && selectedNFT && (
                    <motion.div key="nft-confirm-send" {...viewMotionProps} className="h-full">
                        <NFTConfirmSendView
                            nft={selectedNFT}
                            recipientAddress={recipientAddress}
                            recipientDisplay={recipientDisplay}
                            recipientMeta={recipientMeta}
                            onBack={() => setCurrentView("send-nft")}
                            isSending={isSendingNft}
                            onSend={async () => {
                                const sendToast = showNFTSendToast({
                                    nftName: selectedNFT.name,
                                    nftImage: selectedNFT.image,
                                    recipientDisplay,
                                });
                                const nftMint = selectedNFT.mint;
                                setCurrentView("main");
                                setActiveTab("nfts");
                                setSelectedNFT(null);
                                setIsSendingNft(true);
                                try {
                                    const senderAddress = adapterPublicKey?.toBase58() || walletAddress;
                                    if (!senderAddress) throw new Error("No wallet connected");

                                    const mintPubkey = new PublicKey(nftMint);
                                    const senderPubkey = new PublicKey(senderAddress);
                                    const recipientPubkey = new PublicKey(recipientAddress);

                                    const senderAta = getAssociatedTokenAddressSync(mintPubkey, senderPubkey);
                                    const recipientAta = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey);

                                    const tx = new Transaction();

                                    const recipientAtaInfo = await connection.getAccountInfo(recipientAta);
                                    if (!recipientAtaInfo) {
                                        tx.add(createAssociatedTokenAccountInstruction(
                                            senderPubkey,
                                            recipientAta,
                                            recipientPubkey,
                                            mintPubkey,
                                        ));
                                    }

                                    tx.add(createTransferInstruction(
                                        senderAta,
                                        recipientAta,
                                        senderPubkey,
                                        1,
                                    ));

                                    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
                                    tx.recentBlockhash = blockhash;
                                    tx.feePayer = senderPubkey;

                                    let signature: string;
                                    if (adapterPublicKey) {
                                        signature = await sendTransaction(tx, connection);
                                    } else {
                                        const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
                                        const result = await signAndSendTxFn({
                                            transaction: serialized.toString("base64"),
                                        });
                                        signature = result.signature;
                                    }

                                    await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
                                    sendToast.success(signature);
                                } catch (e) {
                                    console.error("NFT send error:", e);
                                    sendToast.error(e instanceof Error ? e.message : undefined);
                                } finally {
                                    setIsSendingNft(false);
                                }
                            }}
                        />
                    </motion.div>
                )}

                {currentView === "manage-tokens" && (
                    <motion.div key="manage-tokens" {...viewMotionProps} className="h-full">
                        <ManageTokensView
                            tokens={allTokens}
                            hiddenTokenMints={hiddenTokenMints}
                            onBack={() => setCurrentView("main")}
                            onToggleToken={toggleHideToken}
                        />
                    </motion.div>
                )}

                {currentView === "hide-collections" && (
                    <motion.div key="hide-collections" {...viewMotionProps} className="h-full">
                        <HideCollectionView
                            collections={collections}
                            hiddenCollectionIds={hiddenCollectionIds}
                            onBack={() => {
                                if (selectedNFT) {
                                    setCurrentView("nft-detail");
                                } else if (selectedCollection) {
                                    setCurrentView("collection-detail");
                                } else {
                                    setCurrentView("main");
                                    setActiveTab("nfts");
                                }
                            }}
                            onToggleCollection={toggleHideCollection}
                        />
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );

    return (
        <>
            {trigger}

            {/* Portal the overlay to <body> so the backdrop/panel's `fixed`
                positioning is relative to the VIEWPORT, not an ancestor. The app
                header sets `backdrop-blur-xl`, and backdrop-filter (like
                transform/filter) makes an element the containing block for fixed
                descendants — which otherwise shrank this backdrop to the 68px
                header strip, so outside-clicks below the header never hit it and
                the drawer wouldn't close. */}
            {mounted && createPortal(
            <AnimatePresence>
                {resolvedOpen && (
                    <>
                        <motion.div
                            key="wallet-backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ type: "tween", duration: 0.1, ease: "easeOut" }}
                            className="fixed inset-0 z-[55] bg-black/50"
                            onClick={() => onOpenChangeHandler(false)}
                        />

                        {isMobile ? (
                            <motion.div
                                key="wallet-panel-mobile"
                                initial={{ y: "100%" }}
                                animate={{ y: 0 }}
                                exit={{ y: "100%" }}
                                transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
                                className="fixed bottom-0 left-0 right-0 h-[90vh] z-[60] flex flex-col bg-[#080808] border-t border-flexborder/50 overflow-hidden rounded-t-2xl"
                            >
                                {panelContent}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="wallet-panel"
                                initial={{ x: 16, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                exit={{ x: 16, opacity: 0 }}
                                transition={{ type: "tween", duration: 0.1, ease: "easeOut" }}
                                className="fixed right-0 top-0 h-screen w-[515px] z-[60] flex flex-col bg-[#080808] border-l border-baseborder/45 overflow-hidden"
                            >
                                {panelContent}
                            </motion.div>
                        )}
                    </>
                )}
            </AnimatePresence>,
            document.body
            )}
        </>
    );
}
