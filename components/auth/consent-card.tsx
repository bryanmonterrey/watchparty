"use client";

import { useState } from "react";
import Image from "next/image";
import { PinkStarLogo } from "@/components/icons";
import { Squircle } from "@/components/ui/squircle";

// Approve/Deny for the OAuth consent screen. POSTs {accept, oauth_query} to
// the plugin's consent endpoint and follows the returned {redirect, url} —
// both verdicts redirect (deny returns the client's redirect_uri carrying
// error=access_denied), so the button handler is the same shape either way.
//
// This surface paints its own background (the (auth) shell is hardcoded
// black), so colors are fixed values — never theme-flipping tokens (the
// --flexwhite lesson, CLAUDE.md).

type ScopeRow = { scope: string; label: string; desc: string };

// Vendored from @better-auth/oauth-provider's buildSignedOAuthQuery (not a
// public export of the /client entry). The server signs a canonicalized,
// EXACT param set — `sig`, the `ba_param` name list, and every param those
// names cover — so the POST body must carry precisely that subset of
// location.search: one stray appended param (analytics, etc.) and the
// signature check fails.
function buildSignedOAuthQuery(search: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.has("sig")) return null;
  const signedNames = new Set(params.getAll("ba_param"));
  if (signedNames.size === 0) return null;
  const signed = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (key === "sig" || key === "ba_param" || signedNames.has(key)) signed.append(key, value);
  }
  return signed.toString();
}

async function submitConsent(accept: boolean): Promise<string> {
  const oauthQuery = buildSignedOAuthQuery(window.location.search);
  if (!oauthQuery) {
    throw new Error("This authorization request expired. Close this page and try again from the app.");
  }
  const res = await fetch("/api/auth/oauth2/consent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ accept, oauth_query: oauthQuery }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error_description?: string; message?: string };
      detail = body.error_description ?? body.message ?? "";
    } catch {
      /* non-JSON error body */
    }
    throw new Error(detail || "This authorization request expired. Close this page and try again from the app.");
  }
  const body = (await res.json()) as { redirect?: boolean; url?: string };
  if (!body.url) throw new Error("Malformed response from the authorization server");
  return body.url;
}

export function ConsentError({ message }: { message: string }) {
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-[442px] text-center">
        <PinkStarLogo className="mx-auto size-10" />
        <h1 className="mt-6 text-xl font-semibold">Something's off</h1>
        <p className="mt-3 text-sm text-white/60">{message}</p>
      </div>
    </main>
  );
}

export function ConsentCard({
  appName,
  appIcon,
  tosUrl,
  privacyUrl,
  scopes,
  accountName,
  accountAvatar,
}: {
  appName: string;
  appIcon: string | null;
  tosUrl: string | null;
  privacyUrl: string | null;
  scopes: ScopeRow[];
  accountName: string;
  accountAvatar: string | null;
}) {
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(accept: boolean) {
    if (busy) return;
    setError(null);
    setBusy(accept ? "approve" : "deny");
    try {
      window.location.href = await submitConsent(accept);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong — try again.");
      setBusy(null);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-[442px]">
        <div className="flex flex-col items-center text-center">
          <div className="flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            {appIcon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={appIcon} alt="" className="size-full object-cover" />
            ) : (
              <span className="text-lg font-semibold text-white/60">{appName.slice(0, 2)}</span>
            )}
          </div>
          <h1 className="mt-5 text-xl font-semibold">
            {appName} wants access to your account
          </h1>
          <div className="mt-3 flex items-center gap-2 text-sm text-white/60">
            <span className="relative size-5 shrink-0 overflow-hidden rounded-full bg-white/10">
              <Image
                src={accountAvatar || "/avatar.png"}
                alt=""
                fill
                sizes="20px"
                className="object-cover"
              />
            </span>
            <span>Signed in as {accountName}</span>
          </div>
        </div>

        <Squircle asChild radius={20}>
          <ul className="mt-6 flex w-full flex-col divide-y divide-white/10 border border-white/10 bg-white/[0.04] p-1">
            {scopes.map((s) => (
              <li key={s.scope} className="flex items-start gap-3 px-4 py-3.5">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                  <svg viewBox="0 0 16 16" className="size-3" fill="none" aria-hidden>
                    <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block text-xs text-white/50">{s.desc}</span>
                </span>
              </li>
            ))}
          </ul>
        </Squircle>

        <div className="mt-6 flex flex-col gap-2.5">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void decide(true)}
            className="h-12 w-full rounded-full bg-white text-sm font-semibold text-black transition-transform active:scale-[0.97] disabled:opacity-60"
          >
            {busy === "approve" ? "Authorizing…" : "Authorize"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void decide(false)}
            className="h-12 w-full rounded-full text-sm font-medium text-white/60 transition-colors hover:text-white disabled:opacity-60"
          >
            {busy === "deny" ? "Cancelling…" : "Cancel"}
          </button>
        </div>

        {error ? <p className="mt-3 text-center text-sm text-red-400">{error}</p> : null}

        <p className="mt-6 text-center text-xs text-white/40">
          You&apos;ll be sent back to {appName}. Revoke access anytime from your
          account settings.
          {tosUrl || privacyUrl ? (
            <>
              {" "}
              {tosUrl ? (
                <a href={tosUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-white/70">
                  Terms
                </a>
              ) : null}
              {tosUrl && privacyUrl ? " · " : null}
              {privacyUrl ? (
                <a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-white/70">
                  Privacy
                </a>
              ) : null}
            </>
          ) : null}
        </p>
      </div>
    </main>
  );
}
