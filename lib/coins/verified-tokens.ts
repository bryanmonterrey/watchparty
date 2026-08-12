/**
 * Jupiter's verified token list — a canonical allowlist for Solana.
 *
 * Free, no API key, ~3,900 mints.
 *
 * ## What it is FOR, and what it is not
 *
 * It is NOT a spam gate. Measured on the live board 2026-08-12: only 11 of 131
 * solana rows are verified, so gating on it would hide 92% of the board,
 * including ordinary memecoins that are perfectly real.
 *
 * What it is, is an EXEMPTION — and that is the part that matters, because an
 * allowlist is what makes an aggressive denylist safe to write.
 *
 * The impersonation problem has always been that name matching cannot separate
 * `preOPENAI` from `CBETH` ("Coinbase Wrapped Staked ETH"): both contain a
 * brand. `clearsBrandBar` papered over it with a $250k liquidity floor — a
 * proxy that works by accident, lets a $5.4M impersonator through, and would
 * reject a small legitimate project.
 *
 * Verification replaces the proxy with a fact:
 *
 *     brand match AND NOT verified  ->  hide
 *     brand match AND verified      ->  show, it IS the real thing
 *
 * Measured: of 18 known impersonators on the board, **0 are verified**, while
 * CBBTC is. So the brand list can now be expanded aggressively — including to
 * stock tickers — without the false positives that previously capped it.
 *
 * ## Failure is silent and OPEN, deliberately
 *
 * An empty list means "verified nothing", which under the rule above means
 * brand-matched coins get hidden as usual — the pre-existing behaviour. It must
 * never mean "verified everything", which would disable the gate entirely on a
 * fetch hiccup and do so invisibly.
 */

import { withCache } from "@/lib/cache";

const JUPITER_VERIFIED = "https://lite-api.jup.ag/tokens/v2/tag?query=verified";

/** The list moves a few times a day at most; a long TTL keeps this off the hot
 *  path entirely. Cached as an array because Redis cannot store a Set. */
const TTL_SECONDS = 6 * 60 * 60;
const CACHE_KEY = "jupiter:verified:v1";

/** Guards against a truncated or error response replacing a good list — a
 *  200 carrying `[]` would otherwise silently empty the allowlist. */
const MIN_PLAUSIBLE = 500;

type JupToken = { id?: string; address?: string };

async function fetchVerified(): Promise<string[]> {
    const res = await fetch(JUPITER_VERIFIED, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`jupiter ${res.status}`);
    const json = (await res.json()) as JupToken[];
    if (!Array.isArray(json)) throw new Error("jupiter: not an array");
    const mints = json
        .map((t) => (t.id ?? t.address ?? "").toLowerCase())
        .filter((a) => a.length > 0);
    if (mints.length < MIN_PLAUSIBLE) throw new Error(`jupiter: only ${mints.length} mints — refusing`);
    return mints;
}

/**
 * @returns lowercased verified mints. EMPTY on any failure — which reads as
 *   "nothing is exempt", the safe direction, rather than "everything is".
 */
export async function verifiedSolanaMints(): Promise<Set<string>> {
    try {
        const mints = await withCache(CACHE_KEY, TTL_SECONDS, fetchVerified);
        return new Set(mints ?? []);
    } catch (err) {
        console.error("[verified-tokens] fetch failed:", err instanceof Error ? err.message : err);
        return new Set();
    }
}

/** Solana-only: Jupiter indexes no other chain, so a non-solana row is simply
 *  unknown here and must fall through to the other gates rather than be
 *  treated as unverified-and-therefore-suspect. */
export function isVerifiedMint(
    verified: Set<string>,
    network: string,
    tokenAddress: string | null | undefined,
): boolean {
    if (network.toLowerCase() !== "solana" || !tokenAddress) return false;
    return verified.has(tokenAddress.toLowerCase());
}
