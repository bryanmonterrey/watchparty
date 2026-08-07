/**
 * Human decimal string → base units, BigInt-safe — no float ever touches it.
 *
 * THE money-precision function: every EVM swap amount passes through here
 * (server/routers/wallet.ts), where a float rounding error is a wrong trade.
 * Extracted so it can be unit-tested without dragging the wallet router's
 * module graph (db, chains, better-auth) into the test runner.
 *
 * Throws RangeError on malformed input; callers translate to their own error
 * vocabulary (the router wraps it in a BAD_REQUEST TRPCError).
 */
export function humanToBaseUnits(human: string, decimals: number): string {
    const trimmed = human.trim();
    if (!/^\d+(\.\d+)?$/.test(trimmed)) {
        throw new RangeError("Enter a valid amount");
    }
    const [whole, frac = ""] = trimmed.split(".");
    // Truncate, never round: sending MORE than the user typed is the one
    // direction a money conversion must never err in.
    const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
    return (BigInt(whole || "0") * BigInt(10) ** BigInt(decimals) + BigInt(fracPadded || "0")).toString();
}
