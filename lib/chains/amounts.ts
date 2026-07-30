// Decimal string → base units, without ever touching a float.
//
// `parseFloat(amount) * 10 ** decimals` is the obvious version and it is wrong
// for money. An 18-decimal value blows past the 2^53 safe-integer range, and
// even small values pick up representation error along the way
// (0.07 * 1e8 === 6999999.999999999). Everything here is string surgery plus
// BigInt, so the amount that moves is the amount that was on screen.

/**
 * Parse a user-typed decimal amount into base units (lamports, wei, satoshi,
 * MIST, or a token's smallest unit).
 *
 * Throws rather than truncating when more precision is typed than the asset
 * has — silently dropping digits would move a different amount than the one
 * the user is looking at.
 */
export function toBaseUnits(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  if (trimmed === "" || trimmed === "." || !/^\d*\.?\d*$/.test(trimmed)) {
    throw new Error("Not a valid amount");
  }

  const [whole, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) {
    throw new Error(`Too many decimal places — ${decimals} max`);
  }

  return BigInt(`${whole || "0"}${fraction.padEnd(decimals, "0")}`);
}

/** True when `amount` converts cleanly at this precision. */
export function isSendableAmount(amount: string, decimals: number): boolean {
  try {
    return toBaseUnits(amount, decimals) > BigInt(0);
  } catch {
    return false;
  }
}
