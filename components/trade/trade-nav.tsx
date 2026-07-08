"use client";

import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
    ArrowDown01Icon,
    Compass01Icon,
    Target02Icon,
    Telescope01Icon,
    TradeUpIcon,
} from "@hugeicons/core-free-icons";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { WalletIcon } from "@/components/icons";
import { OPEN_WALLET_DRAWER_EVENT } from "@/components/wallet/sol-balance-chip";

// Header section switcher for the trade surface (per Frame 546): the page
// title IS the nav — "Trade ⌄" opens a goo dropdown of trade destinations,
// replacing Axiom's horizontal tab bar.

const SECTIONS: {
    href: string;
    label: string;
    description: string;
    icon: IconSvgElement;
}[] = [
    {
        href: "/trade",
        label: "Discover",
        description: "Trending and new tokens",
        icon: Compass01Icon,
    },
    {
        href: "/trade/memescope",
        label: "Memescope",
        description: "Live bonding-curve board",
        icon: Telescope01Icon,
    },
    {
        href: "/trade/perpetuals",
        label: "Perpetuals",
        description: "Leverage — coming soon",
        icon: TradeUpIcon,
    },
    {
        href: "/trade/predictions",
        label: "Predictions",
        description: "Markets on outcomes — coming soon",
        icon: Target02Icon,
    },
];

function sectionLabel(pathname: string): string {
    const match = [...SECTIONS].sort((a, b) => b.href.length - a.href.length).find((s) => pathname.startsWith(s.href));
    return !match || match.href === "/trade" ? "Trade" : match.label;
}

export function TradeNav() {
    const pathname = usePathname();
    const router = useRouter();

    return (
        <GooDropdown
            align="start"
            side="bottom"
            width={272}
            gap={10}
            fill="#101011"
            panelRadius={24}
            itemHeight={56}
            triggerAriaLabel="Trade sections"
            triggerClassName="flex h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 text-lg font-bold tracking-tight text-white transition-colors hover:bg-white/10"
            trigger={
                <>
                    {sectionLabel(pathname)}
                    <HugeiconsIcon icon={ArrowDown01Icon} className="size-4.5 text-white/60" strokeWidth={2} />
                </>
            }
            items={[
                ...SECTIONS.map((s) => {
                    const active = s.href === "/trade" ? pathname === "/trade" : pathname.startsWith(s.href);
                    return {
                        key: s.href,
                        onClick: () => router.push(s.href),
                        className: "gap-3 px-3 rounded-2xl cursor-pointer hover:bg-white/5 group",
                        label: (
                            <>
                                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-zinc-400 transition-colors group-hover:text-white">
                                    <HugeiconsIcon icon={s.icon} className="size-4.5" strokeWidth={1.8} />
                                </span>
                                <span className="flex min-w-0 flex-col">
                                    <span className={active ? "text-[15px] font-bold text-lantern" : "text-[15px] font-bold text-white"}>
                                        {s.label}
                                    </span>
                                    <span className="truncate text-xs text-zinc-500">{s.description}</span>
                                </span>
                            </>
                        ),
                    };
                }),
                { key: "sep", type: "separator" as const, className: "bg-white/10" },
                {
                    key: "portfolio",
                    onClick: () => window.dispatchEvent(new Event(OPEN_WALLET_DRAWER_EVENT)),
                    className: "gap-3 px-3 rounded-2xl cursor-pointer hover:bg-white/5 group",
                    label: (
                        <>
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-zinc-400 transition-colors group-hover:text-white">
                                <WalletIcon className="size-4.5" />
                            </span>
                            <span className="flex min-w-0 flex-col">
                                <span className="text-[15px] font-bold text-white">Portfolio</span>
                                <span className="truncate text-xs text-zinc-500">Your holdings and activity</span>
                            </span>
                        </>
                    ),
                },
            ]}
        />
    );
}
