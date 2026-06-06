"use client";

import { useEffect } from "react";

// Error boundary for the authenticated app segment. Surfaces the real error
// (on screen + logged to the server/Vercel) instead of a blank "failed to load".
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] render error:", error?.message, "digest:", error?.digest, error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-black px-6 text-center text-white">
      <span className="text-sm font-semibold text-red-400">Something went wrong</span>
      <p className="max-w-sm break-words text-xs text-zinc-400">{error?.message || "Unknown error"}</p>
      {error?.digest && <p className="font-mono text-[11px] text-zinc-600">digest: {error.digest}</p>}
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90"
      >
        Try again
      </button>
    </main>
  );
}
