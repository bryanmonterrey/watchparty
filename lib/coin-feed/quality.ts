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
    "apple inc",
    "microsoft",
    "coinbase",
    "binance",
    "blackrock",
];

export function isBrandSquat(symbol: string, name: string | null | undefined): boolean {
    const hay = `${symbol} ${name ?? ""}`.toLowerCase();
    return BRAND_TERMS.some((t) => hay.includes(t));
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
