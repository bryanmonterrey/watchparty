"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The handful of emoji offered as one-click reactions on the message hover bar.
 *
 * Ranked by **frecency** — recent use beats old use, frequent beats rare — so
 * the bar converges on the four you actually send instead of four someone
 * picked at build time. Ported from buzz's `useQuickReactionEmojis`.
 *
 * Scoped per community: the emoji you reach for in a trading server are not the
 * ones you reach for in a friend server, and a single global list makes both
 * worse. `null` scope is the app-wide bucket (DMs, stream chat).
 *
 * Storage is best-effort. A blocked or full localStorage degrades to the
 * defaults rather than throwing inside a click handler.
 */

const KEY = "watchparty.quick-reactions.v1";
const DEFAULTS = ["👍", "❤️", "😂", "🎉"] as const;
/** Cap the stored history so the entry can't grow without bound. */
const MAX_ENTRIES = 24;
/** Half-life, in ms, for the recency half of the score (~3 days). */
const HALF_LIFE = 3 * 24 * 60 * 60 * 1000;

type Entry = { emoji: string; count: number; lastUsedAt: number };

// localStorage isn't reactive, so a module-level subscriber set + version
// counter drives re-renders — the same shape `lib/debug-loading.ts` uses.
const listeners = new Set<() => void>();
let version = 0;
const notify = () => { version += 1; listeners.forEach((l) => l()); };

function subscribe(cb: () => void) {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}

function storageKey(scope: string | null) {
    return scope ? `${KEY}:${scope}` : KEY;
}

function read(scope: string | null): Entry[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = window.localStorage.getItem(storageKey(scope));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter((e) => typeof e?.emoji === "string") : [];
    } catch {
        return [];
    }
}

function write(scope: string | null, entries: Entry[]) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(storageKey(scope), JSON.stringify(entries.slice(0, MAX_ENTRIES)));
    } catch {
        // Quota or private mode. The bar still works, it just stops learning.
    }
}

/**
 * Frecency: usage count decayed by age. An emoji used ten times last month
 * should not outrank one used three times today.
 */
function score(entry: Entry, now: number): number {
    const age = Math.max(0, now - entry.lastUsedAt);
    return entry.count * Math.pow(0.5, age / HALF_LIFE);
}

/** Record a use. Call this on every reaction the user actually sends. */
export function recordQuickReaction(emoji: string, scope: string | null = null) {
    const entries = read(scope);
    const existing = entries.find((e) => e.emoji === emoji);
    const now = Date.now();
    if (existing) {
        existing.count += 1;
        existing.lastUsedAt = now;
    } else {
        entries.push({ emoji, count: 1, lastUsedAt: now });
    }
    entries.sort((a, b) => score(b, now) - score(a, now));
    write(scope, entries);
    notify();
}

/**
 * Top `limit` emoji for the scope, padded with defaults so the bar is never
 * short — a toolbar that changes width as you use it is worse than a stale
 * suggestion.
 */
export function useQuickReactions(limit = 4, scope: string | null = null): string[] {
    const snapshot = useSyncExternalStore(
        subscribe,
        () => version,
        () => 0,
    );
    void snapshot; // re-render trigger only; the value itself is unused

    return useCallback(() => {
        const now = Date.now();
        const ranked = read(scope)
            .sort((a, b) => score(b, now) - score(a, now))
            .map((e) => e.emoji);
        const out: string[] = [];
        for (const emoji of [...ranked, ...DEFAULTS]) {
            if (!out.includes(emoji)) out.push(emoji);
            if (out.length === limit) break;
        }
        return out;
    }, [limit, scope])();
}
