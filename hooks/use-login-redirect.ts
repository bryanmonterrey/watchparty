"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";

// The ONE way a signed-out visitor is asked to sign in: the /login page, with
// the current path riding along so they come back to what they were doing.
// Never a dialog and never a dead-end toast (decided 2026-10-02) — /login is
// the only surface carrying every method (OAuth, email code, passkey, wallet,
// QR), and a modal copy of it drifts.
export function loginHref(pathname: string | null | undefined) {
    return `/login?callbackUrl=${encodeURIComponent(pathname || "/home")}`;
}

export function useLoginRedirect() {
    const router = useRouter();
    const pathname = usePathname();
    return useCallback(() => router.push(loginHref(pathname)), [router, pathname]);
}
