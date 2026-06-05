import { useState, useCallback } from "react";

const STORAGE_KEY = "search_history";
const MAX_ITEMS = 8;

function readHistory(): string[] {
    if (typeof window === "undefined") return [];
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    } catch {
        return [];
    }
}

export function useSearchHistory() {
    const [history, setHistory] = useState<string[]>(readHistory);

    const addToHistory = useCallback((query: string) => {
        const trimmed = query.trim();
        if (!trimmed) return;
        setHistory(prev => {
            const next = [trimmed, ...prev.filter(h => h !== trimmed)].slice(0, MAX_ITEMS);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    const removeFromHistory = useCallback((query: string) => {
        setHistory(prev => {
            const next = prev.filter(h => h !== query);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    }, []);

    return { history, addToHistory, removeFromHistory };
}
