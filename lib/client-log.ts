"use client";

/**
 * Send a one-line observation from the browser to the server log.
 *
 * Why this exists: the app's interesting surfaces are auth-gated, so they can't
 * be driven from a script — a headless run lands on /login. That made the
 * browser half of every problem invisible from the terminal, and a blank chart
 * looked identical whether the data was missing, the widget refused to mount, or
 * the table simply had nothing to show. Each of those took a separate round of
 * guessing to tell apart.
 *
 * Lines land in `bunx wrangler tail watchparty --format pretty`, tagged so they
 * can be grepped:
 *
 *   [client:coin]   {"coin":"solana:LanY52xP","symbol":"LAN"}
 *   [client:chart]  {"coin":"solana:LanY52xP","state":"ready","ms":1840}
 *   [client:trades] {"coin":"solana:LanY52xP","rows":12,"live":3}
 *
 * Fire-and-forget by design: diagnostics must never delay a render or throw into
 * one. sendBeacon first because it survives the page being navigated away from,
 * which is exactly when a coin-to-coin transition would otherwise lose the line.
 */
export function logClient(tag: string, detail: Record<string, unknown>): void {
    if (typeof window === "undefined") return;
    try {
        const body = JSON.stringify({ tag, detail });
        if (navigator.sendBeacon?.("/api/client-log", new Blob([body], { type: "application/json" }))) return;
        void fetch("/api/client-log", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            keepalive: true,
        });
    } catch {
        /* never break the page for a log line */
    }
}

/** Short, stable id for a coin in a log line — full mints make the line
 *  unreadable and the prefix is already unique in practice. */
export function coinTag(network: string, address: string): string {
    return `${network}:${address.slice(0, 8)}`;
}
