"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Squircle } from "@/components/ui/squircle";

/**
 * Chrome for the internal admin panel. Deliberately plain — this is tooling for
 * one person, not a product surface, so it borrows the app's tokens and spends
 * no design budget beyond being legible.
 */

const NAV = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/coin-spam", label: "Coin spam" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="min-h-screen bg-black text-flexwhite">
            <header className="border-b border-flexborder/50">
                <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div className="flex items-baseline gap-3">
                        <span className="font-semibold">Admin</span>
                        <span className="text-xs text-flexwhite/40">internal</span>
                    </div>
                    <nav className="flex gap-2">
                        {NAV.map((item) => {
                            const active = pathname === item.href;
                            return (
                                <Squircle asChild key={item.href} radius={12}>
                                    <Link
                                        href={item.href}
                                        className={`px-3 py-2 text-sm transition-colors ${
                                            active
                                                ? "bg-flexwhite/10 text-flexwhite"
                                                : "text-flexwhite/60 hover:bg-flexwhite/5 hover:text-flexwhite"
                                        }`}
                                    >
                                        {item.label}
                                    </Link>
                                </Squircle>
                            );
                        })}
                    </nav>
                </div>
            </header>
            <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
        </div>
    );
}
