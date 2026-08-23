"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GoLiveButton } from "@/components/studio/go-live-button";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Home01Icon,
  LiveStreaming01Icon,
  Album02Icon,
  Analytics01Icon,
  UserGroupIcon,
  DollarCircleIcon,
  ArrowLeft01Icon,
} from "@hugeicons/core-free-icons";

// The creator studio shell (studio.watchparty.xyz). A creator's own control
// centre — streams and content live here; monetization links out to the
// /premium hub rather than duplicating it. Lean by design: no wallet stack
// (the (studio) layout wraps only ReactQueryProvider), per the speed rule.

const NAV: { icon: IconSvgElement; label: string; href: string }[] = [
  { icon: Home01Icon, label: "Home", href: "/studio" },
  { icon: LiveStreaming01Icon, label: "Streams", href: "/studio/streams" },
  { icon: Album02Icon, label: "Content", href: "/studio/content" },
  { icon: UserGroupIcon, label: "Community", href: "/studio/community" },
  { icon: Analytics01Icon, label: "Analytics", href: "/studio/analytics" },
  { icon: DollarCircleIcon, label: "Revenue", href: "/studio/revenue" },
];

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-svh w-full bg-background text-foreground">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r border-border/60 p-4 lg:flex">
        <div className="flex items-center gap-2.5 px-2 pb-6">
          <div className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
            <HugeiconsIcon icon={LiveStreaming01Icon} className="size-4.5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">watchparty</span>
            <span className="text-xs tracking-wide text-muted-foreground">Creator Studio</span>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/studio" && pathname.startsWith(`${item.href}`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
                  active ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50"
                }`}
              >
                <HugeiconsIcon icon={item.icon} className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-2">
          {/* Persistent, on every studio page — the cockpit is where you set a
              broadcast UP, not the only place you should be able to start or
              end one. */}
          <GoLiveButton />
          <a
            href="https://watchparty.xyz/home"
            className="flex h-9 items-center gap-3 rounded-lg px-3 text-xs text-muted-foreground transition-colors hover:bg-accent/50"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-3.5" />
            Back to watchparty
          </a>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1 overflow-x-auto border-b border-border/60 px-3 py-2 lg:hidden">
          {NAV.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/studio" && pathname.startsWith(`${item.href}`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs transition-colors ${
                  active ? "bg-accent font-medium" : "text-muted-foreground"
                }`}
              >
                <HugeiconsIcon icon={item.icon} className="size-3.5" />
                {item.label}
              </Link>
            );
          })}
          {/* `ml-auto` + `shrink-0`: the nav row scrolls horizontally, and the
              one control you may need mid-broadcast must not scroll away. */}
          <div className="ml-auto shrink-0 pl-2">
            <GoLiveButton className="!h-8 px-3 text-xs" />
          </div>
        </div>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
