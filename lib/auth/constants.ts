// Where users land after a successful sign-in — the authenticated app home.
// All sign-in paths (email OTP, OAuth callback, passkey, wallet) funnel here.
export const POST_LOGIN_REDIRECT = "/home";

/**
 * Resolve where to send the user after sign-in. Honors a `callbackUrl` (e.g. when
 * ads.watchparty.xyz delegates login to watchparty's passwordless flow) but ONLY
 * if it's same-site: a relative path, or an absolute https URL on watchparty.xyz
 * / *.watchparty.xyz. Anything else (open-redirect attempts, foreign hosts) falls
 * back to the app home.
 */
export function resolvePostLoginRedirect(callbackUrl?: string | null): string {
  if (!callbackUrl) return POST_LOGIN_REDIRECT;
  // Relative path only — reject protocol-relative "//host".
  if (callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")) return callbackUrl;
  try {
    const u = new URL(callbackUrl);
    const sameSite = u.hostname === "watchparty.xyz" || u.hostname.endsWith(".watchparty.xyz");
    if (u.protocol === "https:" && sameSite) return u.toString();
  } catch {
    // not a valid absolute URL — fall through
  }
  return POST_LOGIN_REDIRECT;
}
