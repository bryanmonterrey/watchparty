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
    // EVERY claim must be threaded explicitly. This function once returned
    // only {sub, name}, silently dropping `chat` — and server.ts computes
    // `canChat: claims.chat !== false`, so undefined !== false meant
    // followers-only/subscribers-only stream chat was NOT enforced in
    // production despite being minted and checked correctly everywhere else.
    return {
      sub: payload.sub,
      name,
      ...(typeof payload.chat === "boolean" ? { chat: payload.chat } : {}),
    };
  } catch {
    return null;
  }
}
