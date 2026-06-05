"use client";

import { useState, useMemo } from "react";
import { AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import type { DraftCard } from "../types";
import { TeaserPill } from "./teaser-pill";
import { ExpandedCard } from "./expanded-card";

interface CardsPlayerOverlayProps {
    cards: DraftCard[];
    currentTime: number;
    creatorName?: string;
    className?: string;
    forcedCardId?: string | null;
    onClearForced?: () => void;
}

export function CardsPlayerOverlay({ cards, currentTime, creatorName, className, forcedCardId, onClearForced }: CardsPlayerOverlayProps) {
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [expanded, setExpanded] = useState<string | null>(null);

    const forcedCard = forcedCardId ? (cards.find(c => c.id === forcedCardId) ?? null) : null;

    const visibleCards = useMemo(() =>
        cards.filter(c =>
            currentTime >= c.startTime &&
            currentTime < c.startTime + c.duration &&
            !dismissed.has(c.id)
        ),
        [cards, currentTime, dismissed]
    );

    const expandedCard = visibleCards.find(c => c.id === expanded) ?? null;

    const handleDismiss = (id: string) => {
        setDismissed(prev => new Set([...prev, id]));
        if (expanded === id) setExpanded(null);
    };

    // Forced card (from active selection in card list) — always shown expanded
    if (forcedCard) {
        return (
            <div className={cn("absolute top-3 right-0 pr-3 z-[25] flex flex-col items-end gap-2 pointer-events-none", className)}>
                <AnimatePresence mode="wait">
                    <ExpandedCard
                        key={`forced-${forcedCard.id}`}
                        card={forcedCard}
                        creatorName={creatorName}
                        onCollapse={() => onClearForced?.()}
                    />
                </AnimatePresence>
            </div>
        );
    }

    if (visibleCards.length === 0) return null;

    return (
        <div className={cn("absolute top-3 right-0 pr-3 z-[25] flex flex-col items-end gap-2 pointer-events-none", className)}>
            <AnimatePresence mode="wait">
                {expandedCard && (
                    <ExpandedCard
                        key={`card-${expandedCard.id}`}
                        card={expandedCard}
                        creatorName={creatorName}
                        onCollapse={() => setExpanded(null)}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {!expandedCard && visibleCards.slice(0, 3).map((card) => (
                    <TeaserPill
                        key={`pill-${card.id}`}
                        card={card}
                        onClick={() => setExpanded(card.id)}
                        onDismiss={(e) => { e.stopPropagation(); handleDismiss(card.id); }}
                    />
                ))}
            </AnimatePresence>
        </div>
    );
}
