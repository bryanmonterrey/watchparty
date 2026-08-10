// Pure host validation for developer-webhook endpoints — kept free of db/tRPC
// imports so tests/webhook-hardening.test.ts can cover it without dragging
// the server graph.
//
// Why: we POST signed requests to whatever URL the developer saves. Workers
// have no internal network to SSRF into, but two abuse shapes remain worth
// closing: aiming our own signer at our own API (confused-deputy requests
// wearing our user-agent), and pointing at loopback/link-local literals that
// mean something on OTHER people's infrastructure behind naive allowlists.

const OWN_APEX = "watchparty.xyz";

export function isBlockedWebhookHost(hostname: string): boolean {
    // A trailing-dot FQDN ("watchparty.xyz.") and %2e both resolve to the same
    // records as the bare name but dodge a naive endsWith match — normalize it
    // off before comparing (security-review finding, 2026-08-10).
    const h = hostname.toLowerCase().replace(/\.+$/, "");
    if (h === OWN_APEX || h.endsWith(`.${OWN_APEX}`)) return true;
    if (h === "localhost" || h.endsWith(".localhost")) return true;
    if (h.endsWith(".local") || h.endsWith(".internal")) return true;
    // IP literals (v4, and v6 which URL hostnames carry in brackets).
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true;
    if (h.startsWith("[") || h.includes(":")) return true;
    return false;
}

/** Zod-refine-friendly: true when the https URL points somewhere acceptable. */
export function isAllowedWebhookUrl(url: string): boolean {
    try {
        return !isBlockedWebhookHost(new URL(url).hostname);
    } catch {
        return false;
    }
}
