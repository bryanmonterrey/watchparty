"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StarMark } from "@/components/icons";
import { loginUrl, useSession } from "@/lib/session";

/**
 * The console renders only for a signed-in watchparty account. Signed-out
 * visitors get a full-screen gate that delegates to the main app's login
 * (shared `.watchparty.xyz` cookie brings them back signed in). Errors are
 * kept distinct from signed-out — a network blip must never read as
 * "you're logged out".
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, isPending, error, refetch } = useSession();

  if (isPending) {
    return (
      <div className="flex h-svh w-full items-center justify-center bg-sidebar">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 p-8">
          <Skeleton className="size-12 rounded-xl" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-svh w-full items-center justify-center bg-sidebar p-4">
        <div className="w-full max-w-sm rounded-xl border bg-card p-8 text-center">
          <p className="text-sm font-medium">Couldn&apos;t reach watchparty</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The session check failed. Check your connection and try again.
          </p>
          <Button className="mt-4" variant="outline" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-svh w-full items-center justify-center bg-sidebar p-4">
        <div className="w-full max-w-sm rounded-xl border bg-card p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl bg-black">
            <StarMark className="size-6" />
          </div>
          <p className="mt-4 text-base font-semibold">Developer Console</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Keys, credits, usage, and payments for the watchparty API. Sign in
            with your watchparty account to continue.
          </p>
          <Button className="mt-5 w-full" render={<a href={loginUrl()} />}>
            Sign in with watchparty
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
