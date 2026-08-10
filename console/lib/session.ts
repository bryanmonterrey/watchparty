"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

// The console has no auth of its own. The `.watchparty.xyz` session cookie
// (cross-subdomain since 2026-08-06) rides every same-origin /api call, and
// better-auth's get-session answers with the shared session — so "sign in"
// is just a link to watchparty.xyz/login with a callbackUrl pointing back
// here (the ads-dashboard delegation model).

export interface SessionUser {
  id: string;
  name: string | null;
  email: string;
  username?: string | null;
  avatar_url?: string | null;
  image?: string | null;
  canAdmin?: boolean;
}

interface SessionPayload {
  user: SessionUser;
  session: { id: string; expiresAt: string };
}

async function fetchSession(): Promise<SessionPayload | null> {
  const res = await fetch("/api/auth/get-session", {
    headers: { accept: "application/json" },
  });
  // Throw on failure instead of returning null — a network blip must render
  // as an error, never as "signed out" (ported constraint from the main
  // app's use-auth-session).
  if (!res.ok) throw new Error(`get-session failed: ${res.status}`);
  const data = (await res.json()) as SessionPayload | null;
  return data ?? null;
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      if (error instanceof Error && /4\d\d/.test(error.message)) return false;
      return failureCount < 2;
    },
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return async () => {
    await fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    queryClient.setQueryData(["session"], null);
    window.location.href = "https://watchparty.xyz";
  };
}

/** Where to send a signed-out visitor: the main app's login, returning here. */
export function loginUrl(): string {
  const here =
    typeof window !== "undefined"
      ? window.location.href
      : "https://console.watchparty.xyz";
  const base =
    typeof window !== "undefined" && window.location.hostname === "localhost"
      ? "http://localhost:3001/login"
      : "https://watchparty.xyz/login";
  return `${base}?callbackUrl=${encodeURIComponent(here)}`;
}
