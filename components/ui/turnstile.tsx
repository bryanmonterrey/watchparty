"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Cloudflare Turnstile, run on demand.
 *
 * Deliberately NOT a visible checkbox sitting in the UI. The widget is mounted
 * invisibly and executed when the action is taken, so the common case — a real
 * person clicking once — shows nothing at all, and a challenge appears only if
 * Cloudflare wants one. A permanent "I am not a robot" box on a wallet setup
 * screen would be the most prominent thing on it, which is backwards.
 *
 * `getToken()` resolves the token, or null when Turnstile isn't configured
 * (no site key) — callers proceed in that case and the SERVER decides, since
 * it's the only side whose opinion can't be edited by the client.
 */
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_ID = "cf-turnstile-script";

type TurnstileApi = {
    render: (el: HTMLElement, opts: Record<string, unknown>) => string;
    execute: (id: string) => void;
    reset: (id: string) => void;
    remove: (id: string) => void;
};

declare global {
    interface Window {
        turnstile?: TurnstileApi;
    }
}

/** Load the script once per page, no matter how many widgets ask for it. */
function loadScript(): Promise<TurnstileApi | null> {
    if (typeof window === "undefined") return Promise.resolve(null);
    if (window.turnstile) return Promise.resolve(window.turnstile);

    return new Promise((resolve) => {
        const existing = document.getElementById(SCRIPT_ID);
        const done = () => resolve(window.turnstile ?? null);
        if (existing) {
            existing.addEventListener("load", done, { once: true });
            existing.addEventListener("error", () => resolve(null), { once: true });
            return;
        }
        const script = document.createElement("script");
        script.id = SCRIPT_ID;
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.addEventListener("load", done, { once: true });
        script.addEventListener("error", () => resolve(null), { once: true });
        document.head.appendChild(script);
    });
}

export function useTurnstile() {
    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    const containerRef = useRef<HTMLDivElement | null>(null);
    const widgetIdRef = useRef<string | null>(null);
    const apiRef = useRef<TurnstileApi | null>(null);
    // Set while a challenge is outstanding, so the caller can say "verifying"
    // rather than looking frozen if Cloudflare decides to show something.
    const [challenging, setChallenging] = useState(false);
    const pending = useRef<((token: string | null) => void) | null>(null);

    useEffect(() => {
        if (!siteKey) return;
        let cancelled = false;

        loadScript().then((api) => {
            if (cancelled || !api || !containerRef.current) return;
            apiRef.current = api;
            widgetIdRef.current = api.render(containerRef.current, {
                sitekey: siteKey,
                execution: "execute",
                appearance: "interaction-only",
                callback: (token: string) => {
                    setChallenging(false);
                    pending.current?.(token);
                    pending.current = null;
                },
                "error-callback": () => {
                    setChallenging(false);
                    pending.current?.(null);
                    pending.current = null;
                },
                "expired-callback": () => {
                    if (widgetIdRef.current) apiRef.current?.reset(widgetIdRef.current);
                },
            });
        });

        return () => {
            cancelled = true;
            if (widgetIdRef.current) apiRef.current?.remove(widgetIdRef.current);
            widgetIdRef.current = null;
        };
    }, [siteKey]);

    const getToken = useCallback(async (): Promise<string | null> => {
        if (!siteKey) return null;
        const api = apiRef.current;
        const id = widgetIdRef.current;
        // Script blocked or still loading — let the request go and be judged
        // server-side rather than dead-ending the button.
        if (!api || !id) return null;

        api.reset(id);
        setChallenging(true);
        return new Promise<string | null>((resolve) => {
            pending.current = resolve;
            api.execute(id);
            // Never hang the button on a widget that goes quiet.
            setTimeout(() => {
                if (pending.current === resolve) {
                    pending.current = null;
                    setChallenging(false);
                    resolve(null);
                }
            }, 30_000);
        });
    }, [siteKey]);

    /** Mount this anywhere inside the component — it renders nothing visible. */
    const widget = <div ref={containerRef} className="hidden" aria-hidden />;

    return { getToken, widget, challenging, enabled: !!siteKey };
}
