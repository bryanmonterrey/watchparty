"use client";

import * as React from "react";
import Link from "next/link";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  LiveStreaming01Icon,
  Album02Icon,
  Analytics01Icon,
  DollarCircleIcon,
  ArrowRight01Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";

// Studio home: the creator's at-a-glance dashboard. Live status up top, then
// the jump-off cards to each surface. Reads the same stream.getMine the
// manager uses, so the live badge is consistent across the studio.

function SectionCard({
  icon,
  title,
  desc,
  href,
  external,
}: {
  icon: IconSvgElement;
  title: string;
  desc: string;
  href: string;
  external?: boolean;
}) {
  const body = (
    <div className="flex h-full flex-col gap-2 rounded-2xl border border-border/60 bg-card p-4 transition-colors hover:bg-accent/40">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg border border-border/60">
          <HugeiconsIcon icon={icon} className="size-4 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium">{title}</p>
        <HugeiconsIcon
          icon={external ? LinkSquare02Icon : ArrowRight01Icon}
          className="ml-auto size-3.5 text-muted-foreground"
        />
      </div>
      <p className="text-xs text-muted-foreground">{desc}</p>
    </div>
  );
  return external ? (
    <a href={href}>{body}</a>
  ) : (
    <Link href={href}>{body}</Link>
  );
}

export function StudioHome() {
  const mine = trpc.stream.getMine.useQuery(undefined, { refetchInterval: 30_000 });
  const isLive = !!mine.data?.isLive;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-xl font-semibold">Studio</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your creator control centre — streams, content, and how they perform.
        </p>
      </div>

      {/* Live status hero */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div
            className={`flex size-10 items-center justify-center rounded-xl ${
              isLive ? "bg-red-500/10 text-red-500" : "border border-border/60 text-muted-foreground"
            }`}
          >
            <HugeiconsIcon icon={LiveStreaming01Icon} className="size-5" />
          </div>
          <div>
            <p className="text-sm font-medium">
              {mine.isPending ? "…" : isLive ? "You're live now" : "You're offline"}
            </p>
            <p className="text-xs text-muted-foreground">
              {isLive
                ? `${mine.data?.viewerCount ?? 0} watching${mine.data?.title ? ` · ${mine.data.title}` : ""}`
                : "Head to Streams to go live."}
            </p>
          </div>
        </div>
        <Link
          href="/studio/streams"
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          {isLive ? "Manage stream" : "Go live"}
          <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SectionCard
          icon={LiveStreaming01Icon}
          title="Streams"
          desc="Go live, copy your ingest, and set your title and category."
          href="/studio/streams"
        />
        <SectionCard
          icon={Album02Icon}
          title="Content"
          desc="Your posts, clips, and drafts in one place."
          href="/studio/content"
        />
        <SectionCard
          icon={Analytics01Icon}
          title="Analytics"
          desc="Views, followers, and how your stream performs over time."
          href="/studio/analytics"
        />
        <SectionCard
          icon={DollarCircleIcon}
          title="Monetization"
          desc="Subscriptions, payouts, and earnings — on the premium hub."
          href="https://watchparty.xyz/premium"
          external
        />
      </div>
    </div>
  );
}
