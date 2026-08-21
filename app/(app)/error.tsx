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
      {error?.digest && <p className=" text-[11px] text-zinc-600">digest: {error.digest}</p>}
      {/* The first frames, on screen. A minified message on its own ("r[M] is
          not a function", 2026-08-21) names nothing: it cannot be reproduced
          from a description, and this app is reviewed on PROD, where there is
          no overlay and client logs only reach `wrangler tail`. Frames carry
          the chunk and offset, which is enough to find the call site in the
          deployed bundle. Kept small and muted — it is diagnostics, not the
          message. */}
      {error?.stack && (
        <pre className="mt-1 max-w-lg overflow-x-auto whitespace-pre-wrap break-words text-left text-11 leading-relaxed text-zinc-600">
          {error.stack.split("\n").slice(0, 4).join("\n")}
        </pre>
      )}
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
