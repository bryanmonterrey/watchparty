import { SignJWT } from "jose";
import type { RealtimeClaims } from "./protocol";

/**
 * Mint a short-lived HS256 token the browser hands to the realtime endpoint on
 * connect. app/parties/[party]/[room] verifies it with the same `REALTIME_SECRET` (see
 * `lib/realtime/verify.ts`). Server-only — do not import from client code.
 */
export async function signRealtimeToken(
  claims: RealtimeClaims,
  secret: string,
  ttlSeconds = 120,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ name: claims.name, chat: claims.chat })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
}
