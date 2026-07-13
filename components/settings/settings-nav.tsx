"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
    ArrowDown01Icon,
    ConnectIcon,
    Flag02Icon,
    Notification02Icon,
    SecurityCheckIcon,
    Shield01Icon,
    UserCircleIcon,
} from "@hugeicons/core-free-icons";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { useAuthSession } from "@/hooks/use-auth-session";
import { cn } from "@/lib/utils";

// Section switcher for /settings, rendered in the app header: the page
// title IS the nav — "Profile ⌄" opens a goo dropdown of settings sections,
// same pattern as TradeNav. The active tab lives in ?tab= (nuqs) so the
// header dropdown and the page body stay in sync and tabs are linkable.
//
// Settings holds ONLY account configuration — the creator/money surfaces
// (analytics, earnings, monetization, stream, vault, community tools,
// subscriptions) live in the /premium hub; old /settings?tab= links to those
// redirect there (MOVED_TO_PREMIUM).

// Full historical id list — moved ids stay in the parser so old links still
// parse, then the page redirects them to /premium.
export const SETTINGS_TABS = [
    "profile", "notifications", "privacy", "blocked", "muted", "hidden",
    "sessions", "2fa", "passkeys", "audit", "linked", "wallets", "admin",
    // moved → /premium (kept for deep-link redirects)
    "premium", "subscriptions", "gifts", "payouts", "referrals",
    "analytics", "stream", "vips", "moderators", "bans", "welcome", "mass",
    "tiers", "badges", "promo", "vault", "emotes",
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

// tab → /premium?s= section
export const MOVED_TO_PREMIUM: Partial<Record<SettingsTab, string>> = {
    premium: "plan",
    subscriptions: "subscriptions",
    gifts: "gifts",
    payouts: "payouts",
    referrals: "referrals",
    analytics: "analytics",
    stream: "stream",
    vips: "vips",
    moderators: "moderators",
    bans: "bans",
    welcome: "welcome",
    mass: "mass",
    tiers: "tiers",
    badges: "badges",
    promo: "promo",
    vault: "vault",
    emotes: "emotes",
};

const settingsTabParser = parseAsStringLiteral(SETTINGS_TABS).withDefault("profile");

export function useSettingsTab() {
    return useQueryState("tab", settingsTabParser);
}

type SubItem = { id: SettingsTab; label: string };
// Related panels share one nav item: `subs` render as a pill row above the
// content, and the item's own `id` is its first sub (the tab a click opens).
export type SettingsNavItem = {
    id: SettingsTab;
    label: string;
    description: string;
    icon: IconSvgElement;
    subs?: SubItem[];
};

export const SETTINGS_NAV_GROUPS: { label: string; items: SettingsNavItem[] }[] = [
    {
        label: "General",
        items: [
            {
                id: "profile",
                label: "Profile",
                description: "Avatar and bio",
                icon: UserCircleIcon,
            },
            { id: "notifications", label: "Notifications", description: "What we notify you about",
                icon: Notification02Icon },
            {
                id: "privacy",
                label: "Privacy",
                description: "Visibility, blocked and muted",
                icon: Shield01Icon,
                subs: [
                    { id: "privacy", label: "Privacy" },
                    { id: "blocked", label: "Blocked" },
                    { id: "muted", label: "Muted" },
                    { id: "hidden", label: "Hidden posts" },
                ],
            },
        ],
    },
    {
        label: "Account",
        items: [
            {
                id: "sessions",
                label: "Security",
                description: "Sessions, 2FA and passkeys",
                icon: SecurityCheckIcon,
                subs: [
                    { id: "sessions", label: "Sessions" },
                    { id: "2fa", label: "Two-factor auth" },
                    { id: "passkeys", label: "Passkeys" },
                    { id: "audit", label: "Audit log" },
                ],
            },
            {
                id: "linked",
                label: "Connections",
                description: "Linked accounts and wallets",
                icon: ConnectIcon,
                subs: [
                    { id: "linked", label: "Linked accounts" },
                    { id: "wallets", label: "Wallets" },
                ],
            },
        ],
    },
    {
        label: "Admin",
        items: [{ id: "admin", label: "Admin", description: "Platform administration",
                icon: Flag02Icon }],
    },
];

export const ALL_SETTINGS_ITEMS = SETTINGS_NAV_GROUPS.flatMap((g) => g.items);

export const itemOwnsTab = (item: SettingsNavItem, tab: SettingsTab) =>
    item.id === tab || !!item.subs?.some((s) => s.id === tab);

export function SettingsNav() {
    const [tab, setTab] = useSettingsTab();
    const { data: session } = useAuthSession();

    const isAdmin = session?.user?.role === "admin";
    const navGroups = isAdmin
        ? SETTINGS_NAV_GROUPS
        : SETTINGS_NAV_GROUPS.filter((g) => g.label !== "Admin");

    const active = ALL_SETTINGS_ITEMS.find((i) => itemOwnsTab(i, tab));

    return (
        <GooDropdown
            align="start"
            side="bottom"
            width={272}
            gap={10}
            fill="#101011"
            panelRadius={24}
            itemHeight={56}
            maxPanelHeight={560}
            triggerAriaLabel="Settings sections"
            triggerClassName="flex h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 text-lg font-bold tracking-tight text-white transition-colors hover:bg-white/10"
            trigger={
                <>
                    {active?.label ?? "Settings"}
                    <HugeiconsIcon icon={ArrowDown01Icon} className="size-4.5 text-white/60" strokeWidth={2} />
                </>
            }
            items={navGroups.flatMap((group) => [
                { key: `label-${group.label}`, type: "label" as const, label: group.label, height: 30 },
                ...group.items.map((item) => {
                    const isActive = itemOwnsTab(item, tab);
                    return {
                        key: item.id,
                        onClick: () => setTab(item.id),
                        className: "gap-3 px-3 rounded-2xl cursor-pointer hover:bg-white/5 group",
                        label: (
                            <>
                                <span
                                    className={cn(
                                        "flex size-9 shrink-0 items-center justify-center rounded-full",
                                        isActive
                                            ? "bg-white text-black"
                                            : "bg-white/5 text-zinc-400 transition-colors group-hover:text-white",
                                    )}
                                >
                                    <HugeiconsIcon icon={item.icon} className="size-4.5" strokeWidth={1.8} />
                                </span>
                                <span className="flex min-w-0 flex-col">
                                    <span className="text-[15px] font-bold text-white">{item.label}</span>
                                    <span className="truncate text-xs text-zinc-500">{item.description}</span>
                                </span>
                            </>
                        ),
                    };
                }),
            ])}
        />
    );
}
