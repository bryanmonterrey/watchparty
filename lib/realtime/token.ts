import { SignJWT } from "jose";
import type { RealtimeClaims } from "./protocol";

/**
 * Mint a short-lived HS256 token the browser hands to the realtime worker on
 * connect. The DO verifies it with the same `REALTIME_SECRET` (see
 * `realtime/src/auth.ts`). Server-only — do not import from client code.
 */
export async function signRealtimeToken(
  claims: RealtimeClaims,
  secret: string,
  ttlSeconds = 120,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ name: claims.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(key);
}
