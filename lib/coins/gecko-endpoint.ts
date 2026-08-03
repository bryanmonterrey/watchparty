/**
 * One place that decides which GeckoTerminal endpoint we talk to.
 *
 * GT's public API is keyless and rate-limits BY IP at roughly 30 calls/minute.
 * On Cloudflare that limit is effectively shared with every other Worker on the
 * same egress address, which is why production charts went blank while the
 * identical call succeeded from a laptop — see docs/live-charts-plan.md.
 *
 * A CoinGecko key moves us onto their `/onchain` mirror of the same endpoints,
 * where the limit is per-KEY and far higher. The paths are identical after the
 * base, so every existing caller keeps its URL shape and only the prefix and
 * one header change.
 *
 *   demo key → api.coingecko.com/api/v3/onchain      + x-cg-demo-api-key
 *   pro key  → pro-api.coingecko.com/api/v3/onchain  + x-cg-pro-api-key
 *   no key   → api.geckoterminal.com/api/v2          (keyless, IP-limited)
 *
 * Set COINGECKO_API_KEY, and COINGECKO_PLAN=pro if it's a paid key. Absent a
 * key everything falls back to the keyless base, so this is safe to deploy
 * before the secret exists.
 */

const PUBLIC_BASE = "https://api.geckoterminal.com/api/v2";
const DEMO_BASE = "https://api.coingecko.com/api/v3/onchain";
const PRO_BASE = "https://pro-api.coingecko.com/api/v3/onchain";

const key = () => process.env.COINGECKO_API_KEY?.trim() || "";
const isPro = () => process.env.COINGECKO_PLAN?.trim().toLowerCase() === "pro";

/** Base URL for GT-shaped paths — `/networks/...` in every caller. */
export function gtBase(): string {
    if (!key()) return PUBLIC_BASE;
    return isPro() ? PRO_BASE : DEMO_BASE;
}

/**
 * Headers for a GT request. The Accept version pin is what the keyless API
 * wants and the mirror ignores, so it's safe to send either way.
 */
export function gtHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: "application/json;version=20230302" };
    const k = key();
    if (k) headers[isPro() ? "x-cg-pro-api-key" : "x-cg-demo-api-key"] = k;
    return headers;
}

/** True when we're on a keyed plan — callers can widen their own budgets. */
export const gtKeyed = () => !!key();
