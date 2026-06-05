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
