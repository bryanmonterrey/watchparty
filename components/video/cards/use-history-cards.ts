"use client";

import { useState, useCallback } from "react";
import { nanoid } from "nanoid";
import type { DraftCard, CardType } from "./types";

interface HistoryState {
    past: DraftCard[][];
    present: DraftCard[];
    future: DraftCard[][];
}

export function useHistoryCards(initialCards: DraftCard[] = []) {
    const [history, setHistory] = useState<HistoryState>({
        past: [],
        present: initialCards,
        future: [],
    });

    const undo = useCallback(() => {
        setHistory(s => {
            if (s.past.length === 0) return s;
            return {
                past: s.past.slice(0, -1),
                present: s.past[s.past.length - 1],
                future: [s.present, ...s.future],
            };
        });
    }, []);

    const redo = useCallback(() => {
        setHistory(s => {
            if (s.future.length === 0) return s;
            return {
                past: [...s.past, s.present],
                present: s.future[0],
                future: s.future.slice(1),
            };
        });
    }, []);

    const addCard = useCallback((startTime: number, type: CardType = "video") => {
        const id = `draft-${nanoid(8)}`;
        setHistory(s => {
            const draft: DraftCard = {
                id, postId: "", type, title: "", message: "", url: "",
                startTime, duration: 5, sortOrder: s.present.length, isPersisted: false,
            };
            return { past: [...s.past, s.present], present: [...s.present, draft], future: [] };
        });
        return id;
    }, []);

    const deleteCard = useCallback(async (id: string) => {
        setHistory(s => ({
            past: [...s.past, s.present],
            present: s.present.filter(c => c.id !== id),
            future: [],
        }));
    }, []);

    const saveCard = useCallback(async (card: DraftCard) => {
        setHistory(s => ({
            past: [...s.past, s.present],
            present: s.present.map(c => c.id === card.id ? { ...c, ...card } : c),
            future: [],
        }));
    }, []);

    // Snapshot the current present into history without changing any data.
    // Use this when live patches (patchCard) have already applied the data —
    // calling commitPatch with stale data would overwrite the live state.
    const commit = useCallback(() => {
        setHistory(s => ({ past: [...s.past, s.present], present: s.present, future: [] }));
    }, []);

    // Live patch — no history entry (during drag or form typing before save)
    const patchCard = useCallback((id: string, patch: Partial<DraftCard>) => {
        setHistory(s => ({ ...s, present: s.present.map(c => c.id === id ? { ...c, ...patch } : c) }));
    }, []);

    // Committed patch — creates history entry (e.g., after marker drag ends)
    const commitPatch = useCallback((id: string, patch: Partial<DraftCard>) => {
        setHistory(s => ({
            past: [...s.past, s.present],
            present: s.present.map(c => c.id === id ? { ...c, ...patch } : c),
            future: [],
        }));
    }, []);

    return {
        cards: [...history.present].sort((a, b) => a.startTime - b.startTime),
        present: history.present,
        undo,
        redo,
        commit,
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
        addCard,
        deleteCard,
        saveCard,
        patchCard,
        commitPatch,
        isSaving: false,
    };
}
