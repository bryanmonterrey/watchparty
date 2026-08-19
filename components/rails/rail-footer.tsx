"use client";

import Link from "next/link";
import { GooDropdown, gooMenuItem, GOO_PANEL_FILL } from "@/components/ui/goo-dropdown";
import { cn } from "@/lib/utils";

// The tiny legal footer that closes a right rail, under the last card.
//
// Deliberately the LAST thing in the column and deliberately quiet: 13px,
// muted, dot-separated, no card chrome. It is the only route to the policy
// pages from inside the app, so it has to exist somewhere persistent — the
// alternative (burying them in settings) is where legal links go to die.
//
// The links point at app/(legal)/*, which is its OWN route group precisely so a
// signed-in reader can open them: the (marketing) layout bounces a session to
// /home, so /terms could not have lived there.
//
// The "More" row is a GooDropdown per the house rule (every dropdown in the app
// is one) with side="top" — the footer sits at the bottom of a tall scrolling
// column, so the panel opens upward.
//
// /about survives being signed in because the marketing layout carves it out
// of its signed-in redirect (see app/(marketing)/layout.tsx) — without that,
// this link would bounce every reader straight back to /home.

const LINKS = [
    { label: "Terms", href: "/terms" },
    { label: "Privacy", href: "/privacy" },
    { label: "Cookies", href: "/cookies" },
    { label: "Accessibility", href: "/accessibility" },
    { label: "Ads info", href: "/ads-info" },
];

const MORE = [
    { label: "About", href: "/about" },
    { label: "Get app", href: "/download" },
    { label: "Developers", href: "/developer" },
];

const LINK_CLASS = "transition-colors hover:text-foreground hover:underline";

export function RailFooter({ className }: { className?: string }) {
    return (
        <nav
            aria-label="Footer"
            className={cn(
                "flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 text-12 font-medium text-zinc-600",
                className,
            )}
        >
            {LINKS.map((item) => (
                // The separator travels WITH the link it follows, in the same
                // inline-flex, so a wrap never leaves an orphan dot starting a
                // row — which is what a flat list of alternating link/dot
                // children does at this width.
                <span key={item.href} className="flex items-center gap-2">
                    <Link href={item.href} className={LINK_CLASS}>
                        {item.label}
                    </Link>
                    <span aria-hidden className="select-none text-zinc-600/50">
                        ·
                    </span>
                </span>
            ))}

            <GooDropdown
                align="start"
                side="top"
                width={240}
                gap={8}
                fill={GOO_PANEL_FILL}
                triggerAriaLabel="More footer links"
                triggerClassName={cn("cursor-pointer", LINK_CLASS)}
                trigger={<>More&nbsp;⋯</>}
                items={MORE.map((item) => gooMenuItem({ label: item.label, href: item.href }))}
            />

            {/* w-full forces the copyright onto its own row, so it reads as the
                close of the column rather than as another link. */}
            <span className="w-full pt-0.5 text-zinc-600/80">© 2026 watchparty</span>
        </nav>
    );
}
