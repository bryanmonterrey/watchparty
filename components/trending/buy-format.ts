// Number formatting for the buy dialog, split out when buy-dialog.tsx crossed
// the 1000-line guard. Pure and dependency-free, which is why these were the
// right things to lift: no state, no JSX, and testable without React.

/**
 * Token counts span from millions of a memecoin to fractions of a blue chip, so
 * a fixed precision is wrong at one end or the other: 4 decimals renders
 * "1,234,567.0000", and 0 renders a real 0.0421 position as "0".
 */
export function formatTokens(n: number): string {
    if (!Number.isFinite(n) || n <= 0) return "—";
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

/**
 * Base units -> display units on the STRING, never `Number(raw) / 10 ** dp`.
 * An 18-decimal token passes 2^53 at a single whole token, so the float path
 * silently drops low-order digits on any real balance.
 */
export function scaleUnits(raw: string, decimals: number): number {
    if (!/^\d+$/.test(raw)) return 0;
    if (decimals <= 0) return Number(raw);
    const padded = raw.padStart(decimals + 1, "0");
    return Number(`${padded.slice(0, padded.length - decimals)}.${padded.slice(padded.length - decimals)}`);
}

/** Keyed by native symbol, not by chain: Base, Ethereum and Robinhood all spend
 *  ETH, and someone who picked 0.01 ETH on one means it on the others. */
export const amountKey = (symbol: string) => `trade:quickBuy:${symbol}`;

/**
 * Dollar presets, shared across every token and chain.
 *
 * NOT currency-aware yet, deliberately. `currencyAtom` exists in the wallet
 * settings with nine options, but nothing in the app converts anything — every
 * price we hold (`usdValue`, `priceUsd`) is USD and there is no FX rate source.
 * Rendering "€25" over a USD number would be a lie that looks like a feature;
 * these become currency-aware the day a rate layer exists, and not before.
 */
export const USD_PRESETS = [10, 25, 50, 100] as const;
export const USD_AMOUNT_KEY = "trade:quickBuyUsd";

/**
 * Slippage options, in basis points.
 *
 * 2% is the default because a board buy is chasing a moving coin and a tighter
 * bound mostly produces failed transactions. It used to be a constant printed
 * in a details row, which told the user a number they could not act on —
 * a setting they can change is worth more than a fact they cannot.
 */
export const SLIPPAGE_OPTIONS = [50, 100, 200, 500] as const;
export const DEFAULT_SLIPPAGE_BPS = 200;
export const SLIPPAGE_KEY = "trade:slippageBps";

/** Balances report native SOL as the ...111 mint, but Jupiter routes from
 *  WRAPPED SOL (...112). One digit apart and not interchangeable: quoting
 *  against the native mint simply finds no route. */
export const SOL_NATIVE_MINT = "So11111111111111111111111111111111111111111";
export const SOL_WSOL_MINT = "So11111111111111111111111111111111111111112";
