"use client";

import { useSyncExternalStore } from "react";

// The board's star column — a local watchlist.
//
// Deliberately localStorage and not a table: these are markets we track, not
// coins we host, so a star is a reading preference rather than an account
// object. It costs no request, works signed-out, and can be lifted to the
// server later without the UI changing (swap the store for a query).
//
// One module-level store rather than per-row state: fifty rows each reading
// localStorage would be fifty parses, and a star toggled in one row has to be
// visible to any other row showing the same coin.

const KEY = "wp:trending:starred";

const EMPTY: ReadonlySet<string> = new Set();

let snapshot: ReadonlySet<string> = EMPTY;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) listener();
}

/** Read storage once, on the first subscribe — never at module scope. The first
 *  client render has to match the server's empty set or hydration mismatches. */
function hydrate() {
    if (hydrated) return;
    hydrated = true;
    try {
        const raw = window.localStorage.getItem(KEY);
        if (!raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        snapshot = new Set(parsed.filter((v): v is string => typeof v === "string"));
        emit();
    } catch {
        // storage disabled or corrupt — an empty watchlist is the right fallback
    }
}

function subscribe(onChange: () => void) {
    // Listener first, then hydrate: the very first subscriber has to receive the
    // notification its own hydrate() triggers.
    listeners.add(onChange);
    hydrate();
    return () => {
        listeners.delete(onChange);
    };
}

const getSnapshot = () => snapshot;
const getServerSnapshot = () => EMPTY;

function toggleStar(id: string) {
    const next = new Set(snapshot);
    // delete() reports whether it was there, so this is one lookup, not two.
    if (!next.delete(id)) next.add(id);
    snapshot = next;
    try {
        window.localStorage.setItem(KEY, JSON.stringify([...next]));
    } catch {
        // not worth failing the toggle over — it just won't survive a reload
    }
    emit();
}

/** `id` is `trackedTokenId(network, address)` — the same key the alert feed uses. */
export function useStar(id: string) {
    const starred = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
    return { starred: starred.has(id), toggle: () => toggleStar(id) };
}
