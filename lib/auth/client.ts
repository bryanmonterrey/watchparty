// @ts-ignore - createAuthClient is exported but TS's bundler resolution intermittently misses it
import { createAuthClient } from "better-auth/react";
import {
  customSessionClient,
  multiSessionClient,
  adminClient,
  twoFactorClient,
  emailOTPClient,
} from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";
import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { sentinelClient } from "@better-auth/infra/client";
import { siwsClientPlugin } from "better-auth-siws/client";
import { clearAllSnapshots } from "@/lib/snapshot/store";
import type { auth } from "./server";

// In-flight dedupe for GET /get-session, and ONLY that. authClient.getSession()
// makes a real HTTP request per call and a dozen call sites invoke it directly,
// so concurrent callers (rows mounting, focus refetch + a click handler) used
// to each pay a request — 2026-08-19 that stampede tripped better-auth's rate
// limiter (100/60s) and 429'd legitimate session reads for minutes. Identical
// concurrent GETs now share one response; nothing is cached across time, so
// sign-in/out boundaries read exactly as fresh as before.
const inflightGets = new Map<string, Promise<Response>>();
const dedupedFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET" || !url.includes("/get-session")) return fetch(input, init);
  const existing = inflightGets.get(url);
  if (existing) return existing.then((r) => r.clone());
  const pending = fetch(input, init).finally(() => inflightGets.delete(url));
  inflightGets.set(url, pending);
  return pending.then((r) => r.clone());
};

// EVM SIWE client (Base/Hyperliquid) joins next, alongside this Solana SIWS client.
export const authClient = createAuthClient({
  baseURL:
    process.env.NEXT_PUBLIC_AUTH_URL ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/api/auth`
      : "http://localhost:3001/api/auth"),
  fetchOptions: { customFetchImpl: dedupedFetch },
  plugins: [
    siwsClientPlugin(),
    passkeyClient(),
    // OAuth2 IdP login-resume: when the login page URL carries a signed
    // authorize query (`sig` param), this fetch plugin attaches it as
    // `oauth_query` to every sign-in POST so the server's after-hook can
    // resume /oauth2/authorize once the session lands. Without it, third-
    // party sign-in silently dead-ends at the app after login.
    oauthProviderClient(),
    customSessionClient<typeof auth>(),
    multiSessionClient(),
    emailOTPClient(),
    adminClient(),
    twoFactorClient(),
    sentinelClient(),
  ],
});

// better-auth's client type inference drops the `emailOtp` namespace once the
// (untyped) siws plugin is added to the array. These typed wrappers keep the
// `any` confined to one place while call sites stay clean and typed.
type OtpResult = { error: { message?: string } | null };

export function sendEmailOtp(email: string): Promise<OtpResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (authClient as any).emailOtp.sendVerificationOtp({ email, type: "sign-in" });
}

export function verifyEmailOtp(email: string, otp: string): Promise<OtpResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (authClient as any).signIn.emailOtp({ email, otp });
}

// ── multiSession (several accounts signed in on one device) ─────────────────
// Same inference casualty as emailOtp above — but NOT the same `any`, because
// `any` switches type checking off at the call site. A typo'd method name or a
// body of `{ token }` instead of `{ sessionToken }` would compile clean and fail
// in the browser, which is precisely the class of bug types exist to catch.
//
// So the namespace is asserted ONCE to a narrow declared interface, and every
// call is checked against it. The row type is derived from the SERVER endpoint,
// where better-auth's types are intact, so if the plugin's response shape
// changes upstream this file stops compiling instead of quietly handing the UI a
// different object.
type MultiSessionRows = Awaited<ReturnType<typeof auth.api.listDeviceSessions>>;
type ServerDeviceSessionRow = MultiSessionRows extends readonly (infer R)[] ? R : never;

/**
 * `user` carries our `additionalFields` at runtime — better-auth's
 * parseUserOutput merges them into the output schema — which is why the account
 * switcher gets username and avatar_url with no second lookup. They're spelled
 * out here because the endpoint's own type is the base user record.
 */
export type DeviceSessionRow = ServerDeviceSessionRow & {
  user: {
    username?: string | null;
    avatar_url?: string | null;
    verifiedTier?: string | null;
    hideVerifiedBadge?: boolean | null;
  };
};

type ClientResult<T> = { data: T | null; error: { message?: string } | null };

interface MultiSessionClientApi {
  listDeviceSessions: () => Promise<ClientResult<DeviceSessionRow[]>>;
  setActive: (input: { sessionToken: string }) => Promise<ClientResult<unknown>>;
  revoke: (input: { sessionToken: string }) => Promise<ClientResult<unknown>>;
}

/** The one assertion. Everything downstream of it is type-checked. */
const multiSession = (authClient as unknown as { multiSession: MultiSessionClientApi })
  .multiSession;

export async function listDeviceSessions(): Promise<DeviceSessionRow[]> {
  const { data } = await multiSession.listDeviceSessions();
  return data ?? [];
}

/** Make one of the device's sessions the active one. */
export function setActiveDeviceSession(sessionToken: string) {
  return multiSession.setActive({ sessionToken });
}

/** Sign ONE account out, leaving the rest signed in. `signOut()` clears them all. */
export function revokeDeviceSession(sessionToken: string) {
  return multiSession.revoke({ sessionToken });
}

/**
 * Sign out, and drop every paint-instantly snapshot on the way.
 *
 * Use this instead of `authClient.signOut()` directly. Snapshots are keyed by
 * viewer (`lib/snapshot/keys.ts`), so the next account can never be *painted*
 * with the previous one's data — but keying alone leaves that data sitting in
 * localStorage after they leave, which on a shared machine is the whole
 * problem. Feed pages carry the signed-out user's own like state; notifications
 * and bookmarks are theirs outright.
 *
 * Cleared BEFORE the request, so a signOut that throws or navigates mid-flight
 * still leaves nothing behind. The cost of clearing a session that then fails
 * to end is one slower paint.
 */
export async function signOutAndClearSnapshots(
  ...args: Parameters<typeof authClient.signOut>
) {
  clearAllSnapshots();
  return authClient.signOut(...args);
}
