"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
    Analytics01Icon,
    Archive02Icon,
    ArrowDown01Icon,
    ConnectIcon,
    Crown02Icon,
    FavouriteIcon,
    Flag02Icon,
    Layers01Icon,
    MessageAdd01Icon,
    Notification02Icon,
    PodcastIcon,
    SecurityCheckIcon,
    Shield01Icon,
    UserCircleIcon,
    UserGroup02Icon,
    Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { useAuthSession } from "@/hooks/use-auth-session";
import { cn } from "@/lib/utils";

// Section switcher for /settings, rendered in the app header: the page
// title IS the nav — "Profile ⌄" opens a goo dropdown of settings sections,
// same pattern as TradeNav. The active tab lives in ?tab= (nuqs) so the
// header dropdown and the page body stay in sync and tabs are linkable.

export const SETTINGS_TABS = [
    "profile", "verification", "notifications", "privacy", "blocked", "muted", "hidden",
    "sessions", "2fa", "passkeys", "audit", "linked", "wallets",
    "premium", "subscriptions", "gifts", "payouts", "referrals",
    "analytics", "stream", "vips", "moderators", "bans", "welcome", "mass",
    "tiers", "badges", "promo", "vault", "emotes", "admin",
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

const settingsTabParser = parseAsStringLiteral(SETTINGS_TABS).withDefault("profile");

export function useSettingsTab() {
    return useQueryState("tab", settingsTabParser);
}

type SubItem = { id: SettingsTab; label: string };
// Related panels share one nav item: `subs` render as a pill row above the
// content, and the item's own `id` is its first sub (the tab a click opens).
export type SettingsNavItem = { id: SettingsTab; label: string; icon: IconSvgElement; subs?: SubItem[] };

// Ordered by how often a typical user needs each: personal basics first,
// then account plumbing, money, creator tools, admin last (Instagram-style
// "edit profile up top").
export const SETTINGS_NAV_GROUPS: { label: string; items: SettingsNavItem[] }[] = [
    {
        label: "General",
        items: [
            {
                id: "profile",
                label: "Profile",
                icon: UserCircleIcon,
                subs: [
                    { id: "profile", label: "Edit profile" },
                    { id: "verification", label: "Verification" },
                ],
            },
            { id: "notifications", label: "Notifications", icon: Notification02Icon },
            {
                id: "privacy",
                label: "Privacy",
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
                icon: ConnectIcon,
                subs: [
                    { id: "linked", label: "Linked accounts" },
                    { id: "wallets", label: "Wallets" },
                ],
            },
        ],
    },
    {
        label: "Payments",
        items: [
            { id: "premium", label: "Premium", icon: Crown02Icon },
            {
                id: "subscriptions",
                label: "Subscriptions",
                icon: FavouriteIcon,
                subs: [
                    { id: "subscriptions", label: "My subscriptions" },
                    { id: "gifts", label: "Gift inbox" },
                ],
            },
            {
                id: "payouts",
                label: "Earnings",
                icon: Wallet01Icon,
                subs: [
                    { id: "payouts", label: "Payouts" },
                    { id: "referrals", label: "Referrals" },
                ],
            },
        ],
    },
    {
        label: "Creator",
        items: [
            { id: "analytics", label: "Analytics", icon: Analytics01Icon },
            { id: "stream", label: "Stream", icon: PodcastIcon },
            {
                id: "vips",
                label: "Community",
                icon: UserGroup02Icon,
                subs: [
                    { id: "vips", label: "VIP members" },
                    { id: "moderators", label: "Moderators" },
                    { id: "bans", label: "Channel bans" },
                ],
            },
            {
                id: "welcome",
                label: "Messages",
                icon: MessageAdd01Icon,
                subs: [
                    { id: "welcome", label: "Welcome message" },
                    { id: "mass", label: "Mass message" },
                ],
            },
            {
                id: "tiers",
                label: "Monetization",
                icon: Layers01Icon,
                subs: [
                    { id: "tiers", label: "Subscription tiers" },
                    { id: "badges", label: "Badges" },
                    { id: "promo", label: "Promo codes" },
                ],
            },
            {
                id: "vault",
                label: "Content",
                icon: Archive02Icon,
                subs: [
                    { id: "vault", label: "Media vault" },
                    { id: "emotes", label: "Emotes" },
                ],
            },
        ],
    },
    {
        label: "Admin",
        items: [{ id: "admin", label: "Admin", icon: Flag02Icon }],
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
            width={260}
            gap={10}
            fill="#101011"
            panelRadius={24}
            itemHeight={40}
            maxPanelHeight={520}
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
                ...group.items.map((item) => ({
                    key: item.id,
                    onClick: () => setTab(item.id),
                    className: cn(
                        "gap-2.5 px-3 rounded-full cursor-pointer text-sm font-semibold",
                        itemOwnsTab(item, tab)
                            ? "bg-white/10 text-white"
                            : "text-zinc-300 hover:bg-white/5 hover:text-white",
                    ),
                    label: (
                        <>
                            <HugeiconsIcon icon={item.icon} className="size-4 shrink-0" strokeWidth={2} />
                            {item.label}
                        </>
                    ),
                })),
            ])}
        />
    );
}
