"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { HugeiconsIcon } from "@hugeicons/react";
import { Book02Icon, LinkSquare02Icon } from "@hugeicons/core-free-icons";

const TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/usage": "Usage",
  "/keys": "Keys",
  "/credits": "Credits",
  "/payments": "Payments",
};

export function ConsoleHeader() {
  const pathname = usePathname();
  // Nested routes (/keys/<id>) inherit their section's title.
  const section = Object.keys(TITLES)
    .filter((p) => p !== "/")
    .find((p) => pathname === p || pathname.startsWith(`${p}/`));
  const title = TITLES[pathname] ?? (section ? TITLES[section] : "Console");

  return (
    <header className="flex items-center gap-2 sm:gap-3 px-3 sm:px-6 py-2 sm:py-3 border-b bg-card sticky top-0 z-10 w-full">
      <SidebarTrigger className="-ml-1 sm:-ml-2" />
      <h1 className="text-sm font-medium">{title}</h1>

      <div className="flex-1" />

      <Link
        href="https://docs.watchparty.xyz"
        target="_blank"
        rel="noopener noreferrer"
        className="hidden sm:flex"
      >
        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
          <HugeiconsIcon icon={Book02Icon} className="size-4" />
          Documentation
          <HugeiconsIcon icon={LinkSquare02Icon} className="size-3" />
        </Button>
      </Link>
      <ThemeToggle />
    </header>
  );
}
