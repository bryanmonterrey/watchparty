"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Album02Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";

// Content overview (studio S1). Full in-studio management — edit, delete,
// drafts, scheduling — is the next studio phase; for now this surfaces the
// real counts and links out to the profile where the content already lives.
// No fake rows, no dead controls.

export function ContentView() {
  const { data: session } = useAuthSession();
  const userId = session?.user?.id;
  const username = session?.user?.username as string | undefined;

  const posts = trpc.content.getPostsByUser.useQuery(
    { userId: userId ?? "" },
    { enabled: !!userId },
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Content</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Everything you&apos;ve published. In-studio editing and drafts land
          next — for now, jump to any of it on your profile.
        </p>
      </div>

      <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-lg border border-border/60">
            <HugeiconsIcon icon={Album02Icon} className="size-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Posts &amp; videos</p>
            <p className="text-xs text-muted-foreground">
              {posts.isPending
                ? "Counting…"
                : posts.error
                  ? posts.error.message
                  : `${posts.data.total ?? 0} published`}
            </p>
          </div>
          {username ? (
            <a
              href={`https://watchparty.xyz/${username}`}
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              View on profile
              <HugeiconsIcon icon={LinkSquare02Icon} className="size-3" />
            </a>
          ) : null}
        </div>
      </div>

      <p className="px-1 text-xs text-muted-foreground">
        Coming to the studio: edit and delete posts, manage drafts and
        scheduled posts, and organize clips — all without leaving here.
      </p>
    </div>
  );
}
