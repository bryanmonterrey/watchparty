"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDataTransferVerticalIcon, ArrowDown01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import * as React from "react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { TokenIcon } from "../../components/token-icon";
import { TokenSelectorSkeleton } from "../../components/wallet-skeletons";
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
                    <button className="flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.10] text-white px-3 py-1.5 rounded-full text-15 font-semibold outline-none transition-colors border border-baseborder/20">
                        <TokenIcon
                            src={selectedToken.logoURI}
                            symbol={selectedToken.symbol}
                            size="sm"
                            type="token"
                        />
                        <span>{selectedToken.symbol}</span>
                        <HugeiconsIcon icon={ArrowDown01Icon} className="w-5 h-5 text-zinc-400" />
                    </button>
                ) : (
                    <button className="flex items-center gap-2 bg-white/[0.06] hover:bg-white/[0.10] text-white px-4 py-2 rounded-full text-15 font-bold outline-none transition-colors border border-baseborder/20">
                        <span>Select coin</span>
                        <HugeiconsIcon icon={ArrowDown01Icon} className="w-5 h-5 text-zinc-400" />
                    </button>
                )}
            </DialogTrigger>
            <DialogContent
                className="sm:max-w-md rounded-3xl text-white p-0 overflow-hidden flex flex-col h-[85vh] sm:h-[650px]"
                style={{ animationDuration: '0.2s' }}
            >
                <DialogTitle className="sr-only">Select a coin</DialogTitle>

                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-3">
                    <span className="font-semibold text-15">Select a coin</span>
                </div>

                {/* Search Bar */}
                <div className="px-4 pb-3">
                    <div className="relative flex items-center bg-white/[0.06] rounded-full border border-baseborder/20 transition-colors focus-within:bg-white/[0.09]">
                        <HugeiconsIcon icon={Search01Icon} className="absolute left-4 w-[18px] h-[18px] text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Search coins"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-[52px] w-full bg-transparent pl-11 pr-[80px] text-15 font-medium placeholder:text-zinc-500 focus:outline-none"
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
                                className="flex items-center gap-2.5 px-3 py-3 bg-transparent border border-baseborder/20 hover:bg-white/[0.08] rounded-2xl transition-colors"
                            >
                                <TokenIcon
                                    src={token.logoURI}
                                    symbol={token.symbol}
                                    size="sm"
                                    showChainBadge
                                    type="token"
                                />
                                <span className="font-semibold text-14">{token.symbol}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Divider Title */}
                {!searchQuery && (
                    <div className="px-5 pb-2 pt-4">
                        <span className="flex items-center gap-2 text-12 font-semibold text-zinc-500">
                            <HugeiconsIcon icon={ArrowDataTransferVerticalIcon} className="w-3.5 h-3.5" />
                            Tokens by 24H volume
                        </span>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar pb-4">
                    {isLoadingTokens || isSearching ? (
                        <TokenSelectorSkeleton />
                    ) : filteredTokens.length === 0 ? (
                        <div className="flex items-center justify-center p-8 text-zinc-500 text-14">
                            No tokens found.
                        </div>
                    ) : (
                        <div className="space-y-0.5 px-2">
                            {filteredTokens.map((token: Token) => (
                                <button
                                    key={token.address}
                                    onClick={() => handleSelect(token)}
                                    className="w-full flex items-center justify-between p-3 px-4 hover:bg-white/[0.06] rounded-2xl transition-colors text-left group"
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
                                            <span className="font-semibold text-15 text-zinc-100">{token.name}</span>
                                            <span className="font-medium text-12 text-zinc-500 truncate max-w-[160px] sm:max-w-xs">{token.symbol}</span>
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
