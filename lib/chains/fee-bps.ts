/**
 * The platform's take rate, in basis points. ONE number for every chain.
 *
 * This file exists because the rate was previously written out four times —
 * `SEND_FEE_BPS` in send/fees.ts, `PLATFORM_FEE_BPS` in send/bitcoin.ts, and
 * again in both wallet drawers' send views — and nothing connected them. The
 * duplication was not laziness: send/fees.ts imports the database, so a client
 * component cannot import the constant from there. A dependency-free module can
 * be imported from both sides, which is the only reason the number can be
 * stated once.
 *
 * Keep this file free of imports. The moment it pulls in anything server-side,
 * the send views cannot use it and the copies come back.
 */

/** 0.85% — sends, swaps, every chain. (Matches Jupiter's own default.) */
export const PLATFORM_FEE_BPS = 85;

/** The same rate for callers working in base units. */
export const PLATFORM_FEE_BPS_BIG = BigInt(PLATFORM_FEE_BPS);
