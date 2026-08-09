"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Per-conversation composer drafts that survive navigation.
 *
 * Typing half a message, clicking another channel to check something, and
 * coming back to an empty box is a small betrayal that every chat app solves
 * and this one didn't. Buzz keeps drafts keyed by channel; so do we.
 *
 * Deliberately NOT React state at the app level: a draft is per-key, changes on
 * every keystroke, and must outlive unmount. localStorage keyed by conversation
 * is the whole design.
 *
 * Writes are debounced — a keystroke-rate `setItem` is a synchronous serialize
 * plus a disk write inside the input handler, which is exactly the kind of
 * thing that shows up as typing latency.
 */

const PREFIX = "watchparty.composer-draft.v1:";
const WRITE_DEBOUNCE_MS = 300;
/** Don't persist an essay; a draft this long is a copy-paste accident. */
const MAX_DRAFT = 8_000;

function read(key: string): string {
    if (typeof window === "undefined") return "";
    try {
        return window.localStorage.getItem(PREFIX + key) ?? "";
    } catch {
        return "";
    }
}

function write(key: string, value: string) {
    if (typeof window === "undefined") return;
    try {
        if (value.trim()) {
            window.localStorage.setItem(PREFIX + key, value.slice(0, MAX_DRAFT));
        } else {
            window.localStorage.removeItem(PREFIX + key);
        }
    } catch {
        // Quota or private mode. Drafts stop persisting; typing still works.
        // This runs inside a keystroke handler, so it must never throw.
    }
}

export type ComposerDraft = {
    /** Current text. Seeded from storage on mount and on key change. */
    value: string;
    setValue: (next: string) => void;
    /** Drop the stored draft — call after a successful send. */
    clear: () => void;
};

/**
 * @param key Stable per-conversation id (channelId, conversationId). A null key
 *            disables persistence entirely but keeps the same value API, so
 *            callers don't need a second code path.
 */
export function useComposerDraft(key: string | null): ComposerDraft {
    const [value, setValueState] = useState(() => (key ? read(key) : ""));
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const keyRef = useRef(key);
    const valueRef = useRef(value);
    valueRef.current = value;

    const flush = useCallback((k: string | null, v: string) => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (k) write(k, v);
    }, []);

    // Key change = a different conversation. Flush the OUTGOING draft under its
    // OWN key before swapping — writing it after the key changed would file it
    // under the channel the user just opened, which both loses their draft and
    // puts someone else's text in front of them.
    useEffect(() => {
        const previousKey = keyRef.current;
        if (previousKey === key) return;
        flush(previousKey, valueRef.current);
        keyRef.current = key;
        setValueState(key ? read(key) : "");
    }, [key, flush]);

    // Last-chance persist. A tab close or navigation gets no unmount effect in
    // every browser, so `pagehide` (which fires for bfcache too) is the hook.
    useEffect(() => {
        const persist = () => flush(keyRef.current, valueRef.current);
        window.addEventListener("pagehide", persist);
        return () => {
            window.removeEventListener("pagehide", persist);
            persist();
        };
    }, [flush]);

    const setValue = useCallback((next: string) => {
        setValueState(next);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
            timerRef.current = null;
            if (keyRef.current) write(keyRef.current, next);
        }, WRITE_DEBOUNCE_MS);
    }, []);

    const clear = useCallback(() => {
        setValueState("");
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (keyRef.current) write(keyRef.current, "");
    }, []);

    return { value, setValue, clear };
}
