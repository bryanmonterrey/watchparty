import type { Metadata } from "next";
import { HugeiconsIcon } from "@hugeicons/react";
import { Analytics01Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";

export const metadata: Metadata = { title: "Analytics · Studio" };

// Analytics entry point (studio S1). The full charts already live on the
// premium hub; native in-studio analytics is a follow-up. Honest link-out,
// no placeholder numbers.
export default function StudioAnalyticsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Analytics</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Views, followers, and stream performance. Native studio charts are
          on the way — your current analytics live on the premium hub.
        </p>
      </div>

      <a
        href="https://watchparty.xyz/premium?s=analytics"
        className="flex items-center gap-2.5 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:bg-accent/40 sm:p-5"
      >
        <div className="flex size-8 items-center justify-center rounded-lg border border-border/60">
          <HugeiconsIcon icon={Analytics01Icon} className="size-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-medium">Open analytics</p>
          <p className="text-xs text-muted-foreground">Charts on the premium hub</p>
        </div>
        <HugeiconsIcon icon={LinkSquare02Icon} className="ml-auto size-3.5 text-muted-foreground" />
      </a>
    </div>
  );
}
