"use client";

"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, ChevronDown, Info, X, ArrowDownUp } from "lucide-react";
import { Skeleton } from "boneyard-js/react";
import { TokenIcon } from "../../components/token-icon";
import { trpc } from "@/lib/trpc/client";

export interface Token {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
}

interface TokenSelectorModalProps {
    type: "input" | "output";
    selectedToken: Token | null;
    onSelectToken: (token: Token) => void;
    jupiterTokens: Token[] | undefined;
    isLoadingTokens: boolean;
}

export function TokenSelectorModal({
    type,
    selectedToken,
    onSelectToken,
    jupiterTokens,
    isLoadingTokens
}: TokenSelectorModalProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState("");

    // Popular tokens for the horizontal pill list
    // Use wSOL address (So...112) — that's what Jupiter/CoinGecko token lists use
    const popularTokens = React.useMemo(() => [
        { address: "So11111111111111111111111111111111111111112", symbol: "SOL" },
        { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", symbol: "USDC" },
        { address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", symbol: "USDT" },
        { address: "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", symbol: "WBTC" },
    ], []);

    const populatedPopularTokens = React.useMemo(() => {
        if (!jupiterTokens) return popularTokens.map(p => ({ ...p, name: p.symbol, decimals: 6, logoURI: "" }));
        return popularTokens.map(p => {
            const match = jupiterTokens.find(t => t.address === p.address);
            return match || { ...p, name: p.symbol, decimals: 6, logoURI: "" };
        });
    }, [jupiterTokens, popularTokens]);

    // Debounce the search query so we don't fire on every keystroke
    const [debouncedQuery, setDebouncedQuery] = React.useState("");
    React.useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
        return () => clearTimeout(t);
    }, [searchQuery]);

    const { data: searchResults, isFetching: isSearching } = trpc.wallet.searchTokens.useQuery(
        { query: debouncedQuery },
        { enabled: debouncedQuery.length > 0, staleTime: 30000 }
    );

    const filteredTokens = React.useMemo(() => {
        if (!debouncedQuery) return jupiterTokens ?? [];
        const q = debouncedQuery.toLowerCase();
        const localMatches = (jupiterTokens ?? []).filter(t =>
            t.symbol.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            t.address.toLowerCase() === q
        );
        // Append server results for tokens not already in the local list
        const seen = new Set(localMatches.map(t => t.address));
        const extra = (searchResults ?? []).filter(t => !seen.has(t.address));
        return [...localMatches, ...extra];
    }, [debouncedQuery, jupiterTokens, searchResults]);

    const handleSelect = (token: Token) => {
        onSelectToken(token);
        setIsOpen(false);
        setSearchQuery("");
    };

    return (
        <Dialog
            open={isOpen}
            onOpenChange={(open) => {
                setIsOpen(open);
                if (!open) setSearchQuery("");
            }}
        >
            <DialogTrigger asChild>
                {selectedToken ? (
                    <button className="flex items-center gap-2 bg-[#1b1b1b] hover:bg-zinc-800 text-white px-3 py-1.5 rounded-full text-lg font-semibold outline-none transition-colors border border-zinc-700/50 shadow-sm">
                        <TokenIcon
                            src={selectedToken.logoURI}
                            symbol={selectedToken.symbol}
                            size="sm"
                            type="token"
                        />
                        <span>{selectedToken.symbol}</span>
                        <ChevronDown className="w-5 h-5 text-zinc-400" />
                    </button>
                ) : (
                    <button className="flex items-center gap-2 bg-[#1b1b1b] hover:bg-zinc-800 text-white px-4 py-2 rounded-full text-[17px] font-bold outline-none transition-colors border border-zinc-700/50 shadow-sm">
                        <span>Select token</span>
                        <ChevronDown className="w-5 h-5 text-zinc-400" />
                    </button>
                )}
            </DialogTrigger>
            <DialogContent
                className="sm:max-w-md rounded-3xl text-white p-0 overflow-hidden flex flex-col h-[85vh] sm:h-[650px] shadow-2xl"
                style={{ animationDuration: '0.2s' }}
            >
                <DialogTitle className="sr-only">Select a token</DialogTitle>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <span className="font-semibold text-[17px]">Select a token</span>
                </div>

                {/* Search Bar */}
                <div className="px-4 pb-3">
                    <div className="relative flex items-center bg-[#1b1b1b] rounded-2xl border border-zinc-800 focus-within:border-zinc-700 transition-colors">
                        <Search className="absolute left-4 w-[18px] h-[18px] text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Search tokens"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-transparent pl-11 pr-[80px] py-3.5 text-[17px] font-medium placeholder:text-zinc-500 focus:outline-none"
                        />
                    </div>
                </div>
                {/* Popular Token Pills */}
                {!searchQuery && (
                    <div className="px-4 pb-4 flex flex-wrap gap-2">
                        {populatedPopularTokens.map((token) => (
                            <button
                                key={`popular-${token.address}`}
                                onClick={() => handleSelect(token as Token)}
                                className="flex items-center gap-2.5 px-3 py-3 bg-transparent border border-zinc-800 hover:bg-zinc-800/80 rounded-2xl transition-colors"
                            >
                                <TokenIcon
                                    src={token.logoURI}
                                    symbol={token.symbol}
                                    size="sm"
                                    showChainBadge
                                    type="token"
                                />
                                <span className="font-semibold text-[15px]">{token.symbol}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Divider Title */}
                {!searchQuery && (
                    <div className="px-5 pb-2 pt-1 border-t border-zinc-800/50 mt-1">
                        <span className="text-[14px] font-medium text-zinc-400 flex items-center gap-2">
                            <ArrowDownUp className="w-3.5 h-3.5" />
                            Tokens by 24H volume
                        </span>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pb-4">
                    {isLoadingTokens || isSearching ? (
                        <Skeleton
                            name="token-selector-list"
                            loading={true}
                        >
                            <div className="space-y-0.5 px-2">
                                {[
                                    { address: "addr1", symbol: "SOL", name: "Solana", logoURI: "" },
                                    { address: "addr2", symbol: "USDC", name: "USD Coin", logoURI: "" },
                                    { address: "addr3", symbol: "USDT", name: "Tether", logoURI: "" },
                                    { address: "addr4", symbol: "WBTC", name: "Wrapped Bitcoin", logoURI: "" },
                                    { address: "addr5", symbol: "ETH", name: "Ethereum", logoURI: "" },
                                    { address: "addr6", symbol: "BNB", name: "BNB", logoURI: "" },
                                    { address: "addr7", symbol: "AVAX", name: "Avalanche", logoURI: "" },
                                    { address: "addr8", symbol: "MATIC", name: "Polygon", logoURI: "" },
                                ].map((token) => (
                                    <button
                                        key={token.address}
                                        className="w-full flex items-center justify-between p-3 px-4 hover:bg-zinc-800/50 rounded-2xl transition-colors text-left group"
                                    >
                                        <div className="flex items-center gap-3.5">
                                            <TokenIcon
                                                src={token.logoURI}
                                                symbol={token.symbol}
                                                size="md"
                                                showChainBadge
                                                type="token"
                                            />
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-[16px] text-zinc-100">{token.name}</span>
                                                <span className="font-medium text-[13px] text-zinc-500 truncate max-w-[160px] sm:max-w-xs">{token.symbol}</span>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </Skeleton>
                    ) : filteredTokens.length === 0 ? (
                        <div className="flex items-center justify-center p-8 text-zinc-500 text-[15px]">
                            No tokens found.
                        </div>
                    ) : (
                        <div className="space-y-0.5 px-2">
                            {filteredTokens.map((token: Token) => (
                                <button
                                    key={token.address}
                                    onClick={() => handleSelect(token)}
                                    className="w-full flex items-center justify-between p-3 px-4 hover:bg-zinc-800/50 rounded-2xl transition-colors text-left group"
                                >
                                    <div className="flex items-center gap-3.5">
                                        <TokenIcon
                                            src={token.logoURI}
                                            symbol={token.symbol}
                                            size="md"
                                            showChainBadge
                                            type="token"
                                        />
                                        <div className="flex flex-col">
                                            <span className="font-semibold text-[16px] text-zinc-100">{token.name}</span>
                                            <span className="font-medium text-[13px] text-zinc-500 truncate max-w-[160px] sm:max-w-xs">{token.symbol}</span>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
