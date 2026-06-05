"use client";

import { useState, useCallback } from "react";
import { nanoid } from "nanoid";
import { trpc } from "@/lib/trpc/client";
import type { DraftCard, CardType } from "./types";

// ── Local-only draft store (before video exists in DB) ──────────────────────

export function useLocalCards() {
    const [cards, setCards] = useState<DraftCard[]>([]);

    const addCard = useCallback((startTime: number, type: CardType = "video") => {
        const draft: DraftCard = {
            id: `draft-${nanoid(8)}`,
            postId: "",
            type,
            title: "",
            message: "",
            url: "",
            startTime,
            duration: 5,
            sortOrder: cards.length,
            isPersisted: false,
        };
        setCards(prev => [...prev, draft]);
        return draft.id;
    }, [cards.length]);

    const updateCard = useCallback((id: string, patch: Partial<DraftCard>) => {
        setCards(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    }, []);

    const deleteCard = useCallback((id: string) => {
        setCards(prev => prev.filter(c => c.id !== id));
    }, []);

    const saveCard = useCallback((card: DraftCard) => {
        setCards(prev => prev.map(c => c.id === card.id ? { ...c, ...card } : c));
    }, []);

    return {
        cards: cards.sort((a, b) => a.startTime - b.startTime),
        isLoading: false,
        addCard,
        updateCard,
        saveCard: async (card: DraftCard) => { saveCard(card); },
        deleteCard: async (id: string) => { deleteCard(id); },
        updateLocal: updateCard,
        isSaving: false,
    };
}

// ── DB-backed store (published video) ──────────────────────────────────────

export function useCards(postId: string) {
    const utils = trpc.useUtils();

    const { data, isLoading } = trpc.cards.list.useQuery({ postId }, { enabled: !!postId });
    const dbCards: DraftCard[] = (data?.cards ?? []).map(c => ({
        id: c.id,
        postId: c.postId,
        type: c.type as CardType,
        title: c.title ?? "",
        message: c.message ?? "",
        url: c.url ?? "",
        startTime: c.startTime,
        duration: c.duration,
        sortOrder: c.sortOrder,
        isPersisted: true,
    }));

    const [localDrafts, setLocalDrafts] = useState<DraftCard[]>([]);

    const createMutation = trpc.cards.create.useMutation({
        onSuccess: () => utils.cards.list.invalidate({ postId }),
    });
    const updateMutation = trpc.cards.update.useMutation({
        onSuccess: () => utils.cards.list.invalidate({ postId }),
    });
    const deleteMutation = trpc.cards.delete.useMutation({
        onSuccess: () => utils.cards.list.invalidate({ postId }),
    });

    const allCards = [...dbCards, ...localDrafts].sort((a, b) => a.startTime - b.startTime);

    const addCard = useCallback((startTime: number, type: CardType = "video") => {
        const draft: DraftCard = {
            id: `draft-${nanoid(8)}`,
            postId,
            type,
            title: "",
            message: "",
            url: "",
            startTime,
            duration: 5,
            sortOrder: allCards.length,
            isPersisted: false,
        };
        setLocalDrafts(prev => [...prev, draft]);
        return draft.id;
    }, [allCards.length, postId]);

    const saveCard = useCallback(async (card: DraftCard) => {
        if (card.isPersisted) {
            await updateMutation.mutateAsync({
                id: card.id,
                type: card.type,
                title: card.title,
                message: card.message,
                url: card.url || undefined,
                startTime: card.startTime,
                duration: card.duration,
                sortOrder: card.sortOrder,
            });
        } else {
            await createMutation.mutateAsync({
                postId,
                type: card.type,
                title: card.title,
                message: card.message,
                url: card.url || undefined,
                startTime: card.startTime,
                duration: card.duration,
                sortOrder: card.sortOrder,
            });
            setLocalDrafts(prev => prev.filter(c => c.id !== card.id));
        }
    }, [postId, createMutation, updateMutation]);

    const deleteCard = useCallback(async (id: string) => {
        if (id.startsWith("draft-")) {
            setLocalDrafts(prev => prev.filter(c => c.id !== id));
        } else {
            await deleteMutation.mutateAsync({ id });
        }
    }, [deleteMutation]);

    const updateLocal = useCallback((id: string, patch: Partial<DraftCard>) => {
        setLocalDrafts(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    }, []);

    return {
        cards: allCards,
        isLoading,
        addCard,
        saveCard,
        deleteCard,
        updateLocal,
        isSaving: createMutation.isPending || updateMutation.isPending,
    };
}
