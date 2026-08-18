"use client";

import { DrawerHeader } from "../../components/drawer-chrome";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
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
            className="flex flex-col h-full bg-canvas rounded-2xl overflow-hidden"
        >
            <DrawerHeader
                title="Manage coins"
                onBack={onBack}
                className="sticky top-0 z-10 bg-canvas/80 backdrop-blur-md"
            />

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
                        <p className="text-lg font-medium">No coins found</p>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
