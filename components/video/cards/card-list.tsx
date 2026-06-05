"use client";

import { useState, useCallback, useEffect } from "react";
import { CreateIcon } from "@/components/icons";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { CardItem } from "./card-item";
import type { DraftCard, CardType } from "./types";
import { CARD_TYPE_LABELS } from "./types";

const CARD_TYPES: CardType[] = ["video", "playlist", "channel", "link"];

interface CardListProps {
    cards: DraftCard[];
    videoDuration: number;
    onSaveCard: (card: DraftCard) => Promise<void>;
    onDeleteCard: (id: string) => Promise<void>;
    onChangeCard: (id: string, patch: Partial<DraftCard>) => void;
    onSearchRequest: (type: CardType, editingCardId?: string) => void;
    isSaving: boolean;
    activeCardId?: string | null;
    onSetActive?: (id: string | null) => void;
}

export function CardList({
    cards,
    videoDuration,
    onSaveCard,
    onDeleteCard,
    onChangeCard,
    onSearchRequest,
    isSaving,
    activeCardId,
    onSetActive,
}: CardListProps) {
    const [showList, setShowList] = useState(cards.length > 0);
    const [popoverOpen, setPopoverOpen] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [localDrafts, setLocalDrafts] = useState<Record<string, Partial<DraftCard>>>({});

    // Switch to list view once a card is added
    useEffect(() => {
        if (cards.length > 0) setShowList(true);
    }, [cards.length]);

    const handleTypeSelect = (type: CardType) => {
        setPopoverOpen(false);
        onSearchRequest(type);
    };

    const handleEditSearch = useCallback((card: DraftCard) => {
        onSearchRequest(card.type, card.id);
    }, [onSearchRequest]);

    const handleChange = useCallback((id: string, patch: Partial<DraftCard>) => {
        setLocalDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
        onChangeCard(id, patch);
    }, [onChangeCard]);

    const handleSave = useCallback(async (card: DraftCard) => {
        const merged = { ...card, ...(localDrafts[card.id] ?? {}) };
        await onSaveCard(merged);
        setLocalDrafts(prev => { const n = { ...prev }; delete n[card.id]; return n; });
    }, [localDrafts, onSaveCard]);

    const getDraftCard = (card: DraftCard): DraftCard => ({
        ...card,
        ...(localDrafts[card.id] ?? {}),
    });

    // ── Empty state: 2×2 type-select grid ────────────────────────────────────
    if (!showList) {
        return (
            <div className="flex flex-col h-full p-5 gap-4">
                <p className="text-[13px] text-zinc-400">Select a type of card to begin:</p>
                <div className="grid grid-cols-2 gap-3">
                    {CARD_TYPES.map(type => (
                        <button
                            key={type}
                            disabled={type === "link"}
                            onClick={() => onSearchRequest(type)}
                            className="flex flex-col bg-zinc-900/60 items-center justify-center gap-2.5 py-6 border border-flexborder/25 rounded-3xl hover:border-flexborder/40 cursor-pointer hover:bg-zinc-900/80 transition-all disabled:opacity-35 disabled:cursor-not-allowed"
                        >
                            <CreateIcon className="size-5 text-zinc-300" />
                            <span className="text-[13px] font-medium text-zinc-300">
                                {CARD_TYPE_LABELS[type]}
                            </span>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    // ── List view ─────────────────────────────────────────────────────────────
    return (
        <div className="flex flex-col h-full">
            <div className="px-5 py-3.5 flex-shrink-0">
                <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                    <PopoverTrigger asChild>
                        <button className="flex items-center gap-2 px-4 py-2 cursor-pointer rounded-full bg-white/10 hover:bg-white/[0.16] text-white text-md font-medium transition-colors">
                            <CreateIcon className="size-5" />
                            Card
                        </button>
                    </PopoverTrigger>
                    <PopoverContent
                        side="bottom"
                        align="start"
                        sideOffset={8}
                        className="w-48 bg-neutral-950 border-flexborder/75 rounded-3xl shadow-[0_0_15px_5px_rgba(255,255,255,0.1)] ring ring-white/10 p-1.5 overflow-hidden z-50 flex flex-col gap-1"
                    >
                        {CARD_TYPES.map(type => (
                            <button
                                key={type}
                                disabled={type === "link"}
                                onClick={() => handleTypeSelect(type)}
                                className="flex cursor-pointer items-center gap-3 w-full px-4 py-2.5 text-base font-bold text-zinc-200 hover:bg-white/5 hover:text-white rounded-full transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <CreateIcon className="size-5 text-white flex-shrink-0" />
                                {CARD_TYPE_LABELS[type]}
                            </button>
                        ))}
                    </PopoverContent>
                </Popover>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto">
                {cards.map(card => (
                    <CardItem
                        key={card.id}
                        card={getDraftCard(card)}
                        isExpanded={expandedId === card.id}
                        isActive={activeCardId === card.id}
                        onToggle={() => setExpandedId(prev => prev === card.id ? null : card.id)}
                        onSetActive={() => onSetActive?.(activeCardId === card.id ? null : card.id)}
                        onChange={patch => handleChange(card.id, patch)}
                        onSave={() => handleSave(getDraftCard(card))}
                        onDelete={() => onDeleteCard(card.id)}
                        onEditSearch={() => handleEditSearch(getDraftCard(card))}
                        isSaving={isSaving}
                        duration={videoDuration}
                    />
                ))}
            </div>
        </div>
    );
}
