// The trade surfaces' chain set — one list for the discover board's picker and
// memescope's, so the two can't drift. Matches trade.chainFeed's TRADE_CHAINS
// enum: our wallet registry ∩ what Mobula's pairs endpoint actually serves
// (bitcoin has no token pairs; robinhood 500s).

import {
    SolanaMarkIcon,
    EthereumIcon,
    BaseSquareIcon,
    PolygonIcon,
    BnbIcon,
    HyperliquidIcon,
} from "@/components/icons";

export type TradeChain = "solana" | "ethereum" | "base" | "polygon" | "bnb" | "hyperevm";

export const CHAIN_OPTIONS: {
    id: TradeChain;
    label: string;
    Icon: (props: { className?: string }) => React.ReactNode;
}[] = [
    { id: "solana", label: "Solana", Icon: SolanaMarkIcon },
    { id: "ethereum", label: "Ethereum", Icon: EthereumIcon },
    { id: "base", label: "Base", Icon: BaseSquareIcon },
    { id: "polygon", label: "Polygon", Icon: PolygonIcon },
    { id: "bnb", label: "BNB Chain", Icon: BnbIcon },
    { id: "hyperevm", label: "HyperEVM", Icon: HyperliquidIcon },
];
