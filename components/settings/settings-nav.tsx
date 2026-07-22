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

// Settings navigation. The live nav is SettingsRail (left column of the
// two-column /settings layout); the header shows a static "Settings" title.
// SettingsNav (the goo-dropdown header switcher) is RETIRED but kept at the
// bottom of this file in case it returns. Active tab lives in ?tab= (nuqs)
// so panels stay deep-linkable.
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

// The always-visible left rail (desktop). Grouped items, icon + label +
// description; the active item gets the filled treatment. The page title
// lives in the app header, not here.
export function SettingsRail() {
    const [tab, setTab] = useSettingsTab();
    const { data: session } = useAuthSession();

    const isAdmin = session?.user?.role === "admin";
    const navGroups = isAdmin
        ? SETTINGS_NAV_GROUPS
        : SETTINGS_NAV_GROUPS.filter((g) => g.label !== "Admin");

    return (
        <nav aria-label="Settings sections" className="flex w-full flex-col">
            {navGroups.map((group) => (
                <div key={group.label} className="pb-5">
                    <p className="px-3 pb-1 text-[13px] font-semibold text-zinc-500">{group.label}</p>
                    {group.items.map((item) => {
                        const isActive = itemOwnsTab(item, tab);
                        return (
                            <button
                                key={item.id}
                                onClick={() => setTab(item.id)}
                                className={cn(
                                    "group flex w-full cursor-pointer items-center gap-3 rounded-[18px] px-3 py-2.5 text-left transition-colors",
                                    isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.04]",
                                )}
                            >
                                <span
                                    className={cn(
                                        "flex size-9 shrink-0 items-center justify-center transition-colors",
                                        isActive ? "text-white" : "text-zinc-400 group-hover:text-white",
                                    )}
                                >
                                    <HugeiconsIcon icon={item.icon} className="size-6" strokeWidth={1.8} />
                                </span>
                                <span className="flex min-w-0 flex-col">
                                    <span className={cn("text-[14px] font-bold", isActive ? "text-white" : "text-zinc-200")}>{item.label}</span>
                                    <span className="truncate text-[12px] font-medium text-zinc-500">{item.description}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            ))}
        </nav>
    );
}

// RETIRED (kept just in case): the header goo-dropdown section switcher.
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
                        className: "rounded-full gap-3 px-3 cursor-pointer hover:bg-white/5 group",
                        label: (
                            <>
                                <span
                                    className={cn(
                                        "flex size-9 shrink-0 items-center justify-center",
                                        isActive ? "text-white" : "text-zinc-400 transition-colors group-hover:text-white",
                                    )}
                                >
                                    <HugeiconsIcon icon={item.icon} className="size-6" strokeWidth={1.8} />
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
