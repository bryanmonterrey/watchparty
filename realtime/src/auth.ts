import { jwtVerify } from "jose";
import type { RealtimeClaims } from "../../lib/realtime/protocol";

/**
 * Verify the short-lived token minted by the Next app
 * (`lib/realtime/token.ts`). Returns claims, or null if invalid/expired.
 */
export async function verifyRealtimeToken(
  token: string,
  secret: string,
): Promise<RealtimeClaims | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    const name = typeof payload.name === "string" ? payload.name : "User";
    return { sub: payload.sub, name };
  } catch {
    return null;
  }
}
