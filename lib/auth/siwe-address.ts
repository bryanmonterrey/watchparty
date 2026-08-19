import { parseSiweMessage } from "viem/siwe";

/**
 * The wallet address a sign-in request is for, across all three request shapes
 * this app accepts:
 *
 *   - SIWS (better-auth-siws)   → `body.address`, base58
 *   - SIWE on better-auth 1.6   → `body.walletAddress`
 *   - SIWE on better-auth 1.7   → parsed out of the signed `body.message`
 *
 * 1.7 removed `walletAddress` and `chainId` from both `/siwe/*` bodies — they
 * are `.strict()` now — and reads the address out of the message instead. A
 * hook that only looked at the body would therefore stop seeing EVM sign-ins
 * WITHOUT failing: the user is still created, just with none of the wallet
 * handling that hangs off this value. Hence parsing the message rather than
 * trusting the body alone.
 *
 * The parsed address is the one that was actually signed, which is strictly
 * better than the old separately-supplied field: the two can no longer disagree.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function walletAddressFromBody(body: any): string | undefined {
  const direct = body?.address ?? body?.walletAddress;
  if (typeof direct === "string" && direct.length > 0) return direct;

  const message = body?.message;
  if (typeof message !== "string" || message.length === 0) return undefined;
  try {
    // Returns a partial — a non-SIWE message (e.g. SIWS) simply yields no address.
    return parseSiweMessage(message).address;
  } catch {
    return undefined;
  }
}
