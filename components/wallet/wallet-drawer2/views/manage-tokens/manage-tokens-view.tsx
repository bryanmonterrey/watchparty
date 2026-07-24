"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { Token } from "../../types";
import { TokenSearch } from "./token-search";
import { TokenToggleItem } from "./token-toggle-item";

interface ManageTokensViewProps {
    tokens: Token[];
    hiddenTokenMints?: string[];
    onBack: () => void;
    onToggleToken: (mint: string, hidden: boolean) => void;
}

export function ManageTokensView({
    tokens,
    hiddenTokenMints = [],
    onBack,
    onToggleToken
}: ManageTokensViewProps) {
    const [searchQuery, setSearchQuery] = React.useState("");

    // ON = showing, OFF = hidden
    const [shownTokens, setShownTokens] = React.useState<Record<string, boolean>>(
        () => {
            const hiddenSet = new Set(hiddenTokenMints);
            return Object.fromEntries(tokens.map(t => [t.mint, !hiddenSet.has(t.mint)]));
        }
    );

    // Sync local state when hiddenTokenMints prop updates (after server refetch)
    React.useEffect(() => {
        const hiddenSet = new Set(hiddenTokenMints);
        setShownTokens(Object.fromEntries(tokens.map(t => [t.mint, !hiddenSet.has(t.mint)])));
    }, [hiddenTokenMints]);

    const filteredTokens = tokens.filter(t =>
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.symbol.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleToggle = (mint: string) => {
        const nowShown = !shownTokens[mint];
        setShownTokens(prev => ({ ...prev, [mint]: nowShown }));
        onToggleToken(mint, !nowShown); // hidden = !shown
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex flex-col h-full bg-[#0A0A0A] rounded-2xl overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center justify-between rounded-t-2xl p-4 sticky top-0 bg-[#0A0A0A]/80 backdrop-blur-md z-10">
                <button
                    onClick={onBack}
                    className="p-2 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h2 className="text-[17px] font-bold text-white flex-1 text-center mr-8">
                    Manage Tokens
                </h2>
            </div>

            <TokenSearch value={searchQuery} onChange={setSearchQuery} />

            {/* Tokens List */}
            <div className="flex-1 overflow-y-auto px-4 pb-20 space-y-3 hidden-scrollbar">
                <AnimatePresence mode="popLayout">
                    {filteredTokens.map((token) => (
                        <TokenToggleItem
                            key={token.mint}
                            token={token}
                            shown={shownTokens[token.mint]}
                            onToggle={handleToggle}
                        />
                    ))}
                </AnimatePresence>

                {filteredTokens.length === 0 && (
                    <div className="flex flex-col items-center justify-center pt-20 text-zinc-500">
                        <p className="text-lg font-medium">No tokens found</p>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
