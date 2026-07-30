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
import { sentinelClient } from "@better-auth/infra/client";
import { siwsClientPlugin } from "better-auth-siws/client";
import type { auth } from "./server";

// EVM SIWE client (Base/Hyperliquid) joins next, alongside this Solana SIWS client.
export const authClient = createAuthClient({
  baseURL:
    process.env.NEXT_PUBLIC_AUTH_URL ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/api/auth`
      : "http://localhost:3001/api/auth"),
  plugins: [
    siwsClientPlugin(),
    passkeyClient(),
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
// Same inference casualty as emailOtp above, so the same treatment. Shapes are
// the plugin's own: list-device-sessions returns { session, user } rows deduped
// by user, and both set-active and revoke take the session's token.
//
// `user` carries our `additionalFields` — better-auth's parseUserOutput merges
// them into the output schema — which is why a switcher gets username and
// avatar_url without a second lookup.

export interface DeviceSessionRow {
  session: { token: string; userId: string; expiresAt: string | Date };
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    username?: string | null;
    avatar_url?: string | null;
  };
}

export async function listDeviceSessions(): Promise<DeviceSessionRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (authClient as any).multiSession.listDeviceSessions();
  return (data ?? []) as DeviceSessionRow[];
}

/** Make one of the device's sessions the active one. */
export function setActiveDeviceSession(sessionToken: string): Promise<OtpResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (authClient as any).multiSession.setActive({ sessionToken });
}

/** Sign ONE account out, leaving the rest signed in. `signOut()` clears them all. */
export function revokeDeviceSession(sessionToken: string): Promise<OtpResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (authClient as any).multiSession.revoke({ sessionToken });
}
