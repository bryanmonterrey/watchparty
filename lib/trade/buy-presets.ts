// Buy amounts, keyed by what you're SPENDING.
//
// Keyed by symbol rather than by chain because the same coin spends on several
// (Base, Ethereum and Robinhood all spend ETH), and because the pay-with picker
// can select a token the chain has never heard of. One shared list would be
// nonsense in both directions: 0.05 is ~$95 of ETH, ~$0.02 of POL, and 5 cents
// of USDC.
//
// Each row is roughly $2 / $10 / $25 / $100 at the prices these traded at when
// it was written — close enough to stay sensible as prices drift, and it is
// only ever a starting point the user can override.

const PRESETS: Record<string, readonly number[]> = {
    SOL: [0.05, 0.1, 0.5, 1],
    ETH: [0.001, 0.005, 0.01, 0.05],
    BNB: [0.005, 0.02, 0.05, 0.2],
    POL: [5, 20, 50, 200],
    HYPE: [0.2, 1, 2, 10],
    // Stables are the common case for a non-native buy, and the one where a
    // native-shaped list reads as broken: "0.001" of a dollar is not an amount
    // anyone means.
    USDC: [5, 10, 25, 100],
    USDT: [5, 10, 25, 100],
    DAI: [5, 10, 25, 100],
};

/** Wide enough to be usable for an unknown token, small enough not to be a
 *  dangerous default for a valuable one. */
const FALLBACK = [0.01, 0.05, 0.1, 0.5] as const;

export function presetsForSymbol(symbol: string | undefined | null): readonly number[] {
    if (!symbol) return FALLBACK;
    return PRESETS[symbol.toUpperCase().replace(/^\$/, "")] ?? FALLBACK;
}
