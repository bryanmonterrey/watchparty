"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Compass, Search, ChartCandlestick, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

// Mobile bottom nav — the floating pill bar from public/mobile designs/*.svg.
// Fixed, only below md; AppContainer reserves clearance via max-md:pb-28.
const TABS = [
    { href: "/home", icon: House, label: "Home" },
    { href: "/discover", icon: Compass, label: "Discover" },
    { href: "/search", icon: Search, label: "Search" },
    { href: "/trade", icon: ChartCandlestick, label: "Trade" },
    { href: "/messages", icon: Mail, label: "Messages" },
] as const;

export function MobileTabBar() {
    const pathname = usePathname();

    return (
        <nav
            aria-label="Primary"
            className="fixed inset-x-4 bottom-3 z-50 md:hidden rounded-full border border-border/60 bg-background/80 backdrop-blur-xl shadow-lg"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
            <ul className="flex h-16 items-center justify-between px-7">
                {TABS.map(({ href, icon: Icon, label }) => {
                    const active = pathname === href || pathname.startsWith(href + "/");
                    return (
                        <li key={href}>
                            <Link
                                href={href}
                                aria-label={label}
                                aria-current={active ? "page" : undefined}
                                className={cn(
                                    "flex size-11 items-center justify-center rounded-full transition-colors",
                                    active ? "text-foreground" : "text-muted-foreground"
                                )}
                            >
                                <Icon className="size-6" strokeWidth={active ? 2.5 : 2} />
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
