import { LucideIcon } from "lucide-react";
import type { ChainId } from "@/lib/chains/types";

export interface TokenLink {
    type: string;
    label?: string;
    url: string;
}

export interface Token {
    mint: string;
    /** Network this token lives on — drives the badge in the aggregated list. */
    chain?: ChainId;
    symbol: string;
    name: string;
    icon?: string;
    balance: number;
    price?: number;
    usdValue?: number;
    priceChange24h?: number;
    marketCap?: number;
    fdv?: number;
    description?: string;
    links?: TokenLink[];
    decimals: number;
}

export interface NFT {
    mint: string;
    name: string;
    image: string;
    collectionId?: string;
    collectionName?: string;
    description?: string;
    attributes?: Array<{ trait_type: string; value: any }>;
    floorPrice?: number;
    lastSalePrice?: number;
    totalReturn?: number;
    uniqueHolders?: number;
    network?: string;
    isPinned?: boolean;
}

export interface NFTCollection {
    id: string;
    name: string;
    image: string;
    count: number;
    items: NFT[];
    isPinned?: boolean;
}

export interface Transaction {
    signature: string;
    timestamp: number;
    type: string;
    status: "success" | "failed";
    isOutgoing: boolean;
    amount: number;
    description: string;
    source: string;
    tokenSymbol?: string;
    tokenIcon?: string;
    tokenMint?: string;
    counterpartyAddress?: string;
    networkFee?: number;
    // Swap specific fields
    secondaryTokenSymbol?: string;
    secondaryTokenIcon?: string;
    secondaryTokenMint?: string;
    secondaryAmount?: number;
    isSpam?: boolean;
}

export interface WalletDrawerProps {
    children?: React.ReactNode;
    username: string;
    avatarUrl: string;
    walletAddress?: string;
    onSignOut: () => Promise<void>;
    onChangeWallet?: () => void;
    onRefresh?: () => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export type TabId = "tokens" | "nfts" | "activity";
export type DrawerView = "main" | "receive" | "send" | "swap" | "buy" | "settings" | "advanced" | "app-data" | "balances" | "currency" | "language" | "token-detail" | "activity" | "tx-detail" | "collection-detail" | "nft-detail" | "send-nft" | "nft-confirm-send" | "hide-collections" | "manage-tokens" | "device-key" | "network";

export interface TabType {
    id: TabId;
    name: string;
    icon: LucideIcon;
}
