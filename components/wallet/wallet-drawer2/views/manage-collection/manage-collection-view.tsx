"use client";

import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft } from "lucide-react";
import { NFTCollection } from "../../types";
import { CollectionSearch } from "./collection-search";
import { CollectionToggleItem } from "./collection-toggle-item";

interface HideCollectionViewProps {
    collections: NFTCollection[];
    hiddenCollectionIds?: string[];
    onBack: () => void;
    onToggleCollection: (collectionId: string, hidden: boolean) => void;
}

export function HideCollectionView({ collections, hiddenCollectionIds = [], onBack, onToggleCollection }: HideCollectionViewProps) {
    const [searchQuery, setSearchQuery] = React.useState("");

    const hiddenSet = new Set(hiddenCollectionIds);
    // ON = showing, OFF = hidden
    const [shownCollections, setShownCollections] = React.useState<Record<string, boolean>>(
        () => Object.fromEntries(collections.map(c => [c.id, !hiddenSet.has(c.id)]))
    );

    const filteredCollections = collections.filter(c =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleToggle = (id: string) => {
        const nowShown = !shownCollections[id];
        setShownCollections(prev => ({ ...prev, [id]: nowShown }));
        onToggleCollection(id, !nowShown); // hidden = !shown
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex flex-col h-full bg-[#0A0A0A] rounded-2xl overflow-hidden"
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 sticky top-0 bg-[#0A0A0A]/80 backdrop-blur-md z-10">
                <button
                    onClick={onBack}
                    className="p-2 rounded-full hover:bg-white/5 transition-colors cursor-pointer"
                >
                    <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <h2 className="text-[17px] font-bold text-white flex-1 text-center mr-8">
                    Manage Collectibles
                </h2>
            </div>

            <CollectionSearch value={searchQuery} onChange={setSearchQuery} />

            {/* Collections List */}
            <div className="flex-1 overflow-y-auto px-4 pb-20 space-y-3 hidden-scrollbar">
                <AnimatePresence mode="popLayout">
                    {filteredCollections.map((collection) => (
                        <CollectionToggleItem
                            key={collection.id}
                            collection={collection}
                            shown={shownCollections[collection.id]}
                            onToggle={handleToggle}
                        />
                    ))}
                </AnimatePresence>

                {filteredCollections.length === 0 && (
                    <div className="flex flex-col items-center justify-center pt-20 text-zinc-500">
                        <p className="text-lg font-medium">No collections found</p>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
