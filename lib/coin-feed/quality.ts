// Alert-quality gates — pure and unit-tested (tests/feed-quality.test.ts).
//
// The observed failure (2026-08-07): the alert rail recommending $CLAUDE /
// $ANTHROPIC coins. Launch-day pumps clear the per-network liquidity/volume
// floors easily, and a coin named after a famous brand is overwhelmingly rug
// bait riding the name. This is a HIGH BAR, not a ban: a brand-squatting name
// may still alert once it carries liquidity no drive-by rug bothers to fake.

/** Liquidity a brand-riding coin must hold before it may enter the alert
 *  watch list. Rugs pump VOLUME cheaply; parked liquidity is what they don't
 *  leave lying around. */
export const BRAND_SQUAT_MIN_LIQUIDITY_USD = 250_000;

/** Substring-matched against symbol AND name, lowercased. Deliberately the
 *  names spam actually rides — AI labs/products and perennially-squatted
 *  companies — not a general profanity/brand registry. Extend as observed. */
const BRAND_TERMS = [
    // AI labs and products — the reported spam.
    "claude",
    "anthropic",
    "openai",
    "chatgpt",
    "gpt-5",
    "gpt5",
    "deepseek",
    "midjourney",
    "copilot",
    "grok",
    // Perennially-squatted companies.
    "tesla",
    "spacex",
    "nvidia",
    "microsoft",
    "coinbase",
    "binance",
    "blackrock",
];

/** Ambiguous words matched on WORD BOUNDARIES, not substrings — $APPLE and
 *  "Apple Coin" ride the brand, $PINEAPPLE is a fruit. (Reported culprits
 *  2026-08-07: nvidia, openai, apple.) */
const BRAND_WORDS = ["apple", "aapl"];
const BRAND_WORD_RE = new RegExp(`\\b(${BRAND_WORDS.join("|")})\\b`, "i");

export function isBrandSquat(symbol: string, name: string | null | undefined): boolean {
    const hay = `${symbol} ${name ?? ""}`.toLowerCase();
    return BRAND_TERMS.some((t) => hay.includes(t)) || BRAND_WORD_RE.test(hay);
}

// ── Holder-quality risk (Mobula security stats) ─────────────────────────────
//
// One set of thresholds serving two surfaces: the boards' "hide risky coins"
// toggle (fields ride free on the pairs feed) and the alert watch list's
// adoption gate (cached token/details lookup). Null-safe and fail-OPEN: brand
// new coins report nothing, and "no data" must never read as "risky".

export interface HoldingsRisk {
    top10Pct: number | null;
    snipersPct: number | null;
    insidersPct: number | null;
    bundlersPct: number | null;
    devPct: number | null;
}

/** Concentration levels at which a coin is one wallet-cluster's exit event. */
export function isRiskyHoldings(h: HoldingsRisk): boolean {
    return (
        (h.top10Pct ?? 0) >= 80 ||
        (h.snipersPct ?? 0) >= 40 ||
        (h.insidersPct ?? 0) >= 40 ||
        (h.bundlersPct ?? 0) >= 40 ||
        (h.devPct ?? 0) >= 30
    );
}

/** The alert-adoption bar: contract flags plus the holdings thresholds.
 *  Fail-open on missing data — the gate exists to stop KNOWN-bad coins. */
export function passesSecurityBar(
    sec:
        | (HoldingsRisk & {
              honeypotFlag: boolean | null;
              buyTaxPct: number | null;
              sellTaxPct: number | null;
              securityScore: number | null;
          })
        | null
        | undefined,
): boolean {
    if (!sec) return true;
    if (sec.honeypotFlag) return false;
    if ((sec.buyTaxPct ?? 0) > 10 || (sec.sellTaxPct ?? 0) > 10) return false;
    if (sec.securityScore != null && sec.securityScore < 30) return false;
    return !isRiskyHoldings(sec);
}

/** The gate discovery applies on top of the per-network floors: brand-riding
 *  names need the high liquidity bar; everything else passes through to the
 *  normal floors. */
export function clearsBrandBar(
    symbol: string,
    name: string | null | undefined,
    liquidityUsd: number | null | undefined,
): boolean {
    if (!isBrandSquat(symbol, name)) return true;
    return (liquidityUsd ?? 0) >= BRAND_SQUAT_MIN_LIQUIDITY_USD;
}
