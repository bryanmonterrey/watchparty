"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await authClient.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="mt-3 rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-white/5 disabled:opacity-50"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
