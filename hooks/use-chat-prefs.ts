"use client";

import { useCallback, useEffect, useState } from "react";

// Chat Appearance, from the settings panel.
//
// Purely local, and deliberately so: these are display preferences for the
// person reading, not facts about them, and a round trip (plus a column, plus
// cache invalidation) to remember that someone likes big text would be a poor
// trade. The cost is that they don't follow you between devices.

export type ChatFontSize = "sm" | "md" | "lg";

export type ChatPrefs = {
    fontSize: ChatFontSize;
    timestamps: boolean;
    badges: boolean;
    emotes: boolean;
};

export const DEFAULT_CHAT_PREFS: ChatPrefs = {
    fontSize: "md",
    timestamps: false,
    badges: true,
    emotes: true,
};

/** Text size per line, matched to the rail's 13px baseline at "md". */
export const CHAT_FONT_CLASS: Record<ChatFontSize, string> = {
    sm: "text-[12px]",
    md: "text-[13px]",
    lg: "text-[15px]",
};

const STORAGE_KEY = "wp:chat-prefs";

export function useChatPrefs() {
    const [prefs, setPrefs] = useState<ChatPrefs>(DEFAULT_CHAT_PREFS);

    // After mount, never during render — the rail server-renders, and reading
    // localStorage in render is a hydration mismatch.
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (raw) setPrefs({ ...DEFAULT_CHAT_PREFS, ...JSON.parse(raw) });
        } catch {
            // storage disabled or a malformed entry — defaults are fine
        }
    }, []);

    const update = useCallback((patch: Partial<ChatPrefs>) => {
        setPrefs((prev) => {
            const next = { ...prev, ...patch };
            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch { /* not worth failing the toggle over */ }
            return next;
        });
    }, []);

    return { prefs, update };
}
