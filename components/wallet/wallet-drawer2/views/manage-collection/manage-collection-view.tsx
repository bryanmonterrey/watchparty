"use client";

import { DrawerHeader, DrawerEmptyState as EmptyState } from "../../components/drawer-chrome";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import * as React from "react";
import { motion, AnimatePresence } from "motion/react";
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
            className="flex h-full flex-col overflow-hidden bg-canvas"
        >
            <DrawerHeader
                title="Manage collectibles"
                onBack={onBack}
                className="sticky top-0 z-10 bg-canvas/80 backdrop-blur-md"
            />

            <CollectionSearch value={searchQuery} onChange={setSearchQuery} />

            {/* Collections List */}
            <div className="flex-1 overflow-y-auto hidden-scrollbar space-y-1 px-4 pb-20">
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
                    <EmptyState
                        title="No collections found"
                        description="Nothing here matches that search."
                    />
                )}
            </div>
        </motion.div>
    );
}
