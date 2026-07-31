"use client";

import * as React from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Search, X } from "lucide-react";
import { TokenIcon } from "../../components/token-icon";
import type { ChainId } from "@/lib/chains/types";

export interface SendToken {
    mint: string;
    /** Network the asset lives on — decides which send path moves it. */
    chain?: ChainId;
    symbol: string;
    name: string;
    icon?: string;
    balance: number;
    usdValue?: number;
    decimals: number;
}

interface SendTokenSelectorProps {
    open: boolean;
    onClose: () => void;
    tokens: SendToken[];
    selectedMint: string;
    onSelect: (token: SendToken) => void;
}

export function SendTokenSelector({
    open,
    onClose,
    tokens,
    selectedMint,
    onSelect,
}: SendTokenSelectorProps) {
    const [search, setSearch] = React.useState("");

    const filtered = React.useMemo(() => {
        const q = search.toLowerCase();
        if (!q) return tokens;
        return tokens.filter(
            (t) =>
                t.symbol.toLowerCase().includes(q) ||
                t.name.toLowerCase().includes(q) ||
                t.mint.toLowerCase().includes(q)
        );
    }, [tokens, search]);

    const handleSelect = (token: SendToken) => {
        onSelect(token);
        onClose();
        setSearch("");
    };

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setSearch(""); } }}>
            <DialogContent className="sm:max-w-sm rounded-3xl text-white p-0 overflow-hidden flex flex-col max-h-[75vh] shadow-2xl">
                <DialogTitle className="sr-only">Select a coin</DialogTitle>

                {/* Header */}
                <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-shrink-0">
                    <span className="text-[16px] font-semibold text-white">Select a coin</span>
                </div>

                {/* Search */}
                <div className="px-4 pb-3 flex-shrink-0">
                    <div className="relative flex items-center bg-[#1b1b1b] rounded-2xl border border-zinc-800 focus-within:border-zinc-700 transition-colors">
                        <Search className="absolute left-4 w-[18px] h-[18px] text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Search coins"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                            className="h-[52px] w-full bg-transparent pl-11 pr-4 text-[17px] font-medium placeholder:text-zinc-500 focus:outline-none"
                        />
                    </div>
                </div>

                {/* Token list */}
                <div className="overflow-y-auto flex-1 px-3 pb-4">
                    <div className="px-2 pb-2">
                        <span className="text-[12px] font-semibold text-zinc-500 uppercase tracking-wide">Your coins</span>
                    </div>
                    <div className="space-y-0.5">
                        {filtered.length === 0 ? (
                            <div className="py-10 text-center text-[14px] text-zinc-500">No coins found</div>
                        ) : (
                            filtered.map((token) => (
                                <button
                                    key={token.mint}
                                    onClick={() => handleSelect(token)}
                                    className={`cursor-pointer w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-colors ${token.mint === selectedMint
                                        ? "bg-zinc-800/70"
                                        : "hover:bg-zinc-800/40"
                                        }`}
                                >
                                    {/* Logo. The chain badge is load-bearing here,
                                        not decoration: the network decides which
                                        address a send is valid for, and without it
                                        USDC-on-Base and USDC-on-Solana are the
                                        same row. */}
                                    <TokenIcon
                                        src={token.icon}
                                        symbol={token.symbol}
                                        size="md"
                                        type="token"
                                        chain={token.chain}
                                        isNative={token.mint.startsWith("native:")}
                                    />

                                    {/* Name / symbol */}
                                    <div className="flex-1 text-left min-w-0">
                                        <p className="text-[14px] font-semibold text-white leading-tight truncate">{token.name}</p>
                                        <p className="text-[12px] text-zinc-500 leading-tight">{token.symbol}</p>
                                    </div>

                                    {/* Balance */}
                                    <div className="text-right flex-shrink-0">
                                        {token.usdValue !== undefined && (
                                            <p className="text-[14px] font-semibold text-white">
                                                ${token.usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </p>
                                        )}
                                        <p className="text-[12px] text-zinc-500">
                                            {token.balance < 0.0001 && token.balance > 0
                                                ? "<0.0001"
                                                : token.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                        </p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
