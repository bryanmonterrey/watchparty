"use client";

import { useSyncExternalStore } from "react";

// Dev/QA switch that PINS the UI into its loading state, so skeletons can be
// designed against the real thing instead of a 200ms flash you can't screenshot.
//
// Opt a component in by OR-ing `useForceLoading()` into whatever it already
// treats as loading. The toggle UI is components/dev/loading-debug.tsx, revealed
// by `?debug-loading` in the URL — same opt-in idiom as `?debug-onboarding=true`
// in app-onboarding.tsx, and it works on the deployed site (this app is reviewed
// on prod, so a NODE_ENV gate would make the button useless).
//
// sessionStorage, not localStorage: both flags die with the tab, so nobody can
// leave themselves permanently stuck behind skeletons.

type Flag = "loading" | "panel";

const STORAGE_KEY: Record<Flag, string> = {
    loading: "wp-debug-loading",
    panel: "wp-debug-panel",
};

function read(flag: Flag): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.sessionStorage.getItem(STORAGE_KEY[flag]) === "1";
    } catch {
        return false;
    }
}

const state: Record<Flag, boolean> = {
    loading: read("loading"),
    panel: read("panel"),
};

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function setDebugFlag(flag: Flag, value: boolean) {
    if (state[flag] === value) return;
    state[flag] = value;
    try {
        window.sessionStorage.setItem(STORAGE_KEY[flag], value ? "1" : "0");
    } catch {
        // private mode / storage blocked — in-memory still works for this page
    }
    listeners.forEach((l) => l());
}

// getServerSnapshot returns false so SSR/prerender always renders the real UI;
// React re-checks the client store right after hydration and re-renders if the
// flag was already set for this tab.
export function useDebugFlag(flag: Flag): boolean {
    return useSyncExternalStore(
        subscribe,
        () => state[flag],
        () => false,
    );
}

/** True while the debug toggle is holding the UI in its loading state. */
export function useForceLoading(): boolean {
    return useDebugFlag("loading");
}
