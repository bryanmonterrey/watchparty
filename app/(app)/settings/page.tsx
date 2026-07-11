"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Analytics01Icon,
    Archive02Icon,
    ArrowDown01Icon,
    Award01Icon,
    BanIcon,
    CheckmarkBadge01Icon,
    Crown02Icon,
    Crown03Icon,
    EyeIcon,
    FavouriteIcon,
    Flag02Icon,
    GiftIcon,
    Layers01Icon,
    Link01Icon,
    MessageAdd01Icon,
    Notification02Icon,
    PodcastIcon,
    SecurityCheckIcon,
    SecurityLockIcon,
    SentIcon,
    Shield01Icon,
    Shield02Icon,
    SmileIcon,
    Tag01Icon,
    UserBlock01Icon,
    UserGroup02Icon,
    ViewOffSlashIcon,
    VolumeMute02Icon,
    Wallet01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { Squircle } from "@/components/ui/squircle";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { cn } from "@/lib/utils";

// Port of sidebar's (browse)/settings/page.tsx, with two changes:
// - Every tab panel loads via next/dynamic, so /settings ships only the tab
//   you open instead of all ~25 managers (analytics charts included — they
//   pull a chart lib). Sidebar imported everything eagerly.
// - The client-side `redirect("/")` guard is gone; the (app) layout guards.
//
// Shell design mirrors /trade: the page title lives in the app header (next
// to the logo), sections are a vertical grouped rail on desktop and a
// GooDropdown picker on mobile, and content sits in bg-panel squircles.

function PanelLoading() {
    return (
        <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 overflow-hidden rounded-[20px]"><div className="size-full shimmer-skeleton" /></div>
            ))}
        </div>
    );
}

// NOTE: dynamic() options must stay inline object literals — Turbopack
// statically analyzes them and errors on a shared `const` reference.
const AnalyticsCharts = dynamic(() => import("@/components/settings/analytics-charts").then(m => m.AnalyticsCharts), { loading: PanelLoading, ssr: false });
const StreamSettings = dynamic(() => import("@/components/settings/stream-settings").then(m => m.StreamSettings), { loading: PanelLoading, ssr: false });
const PrivacySettings = dynamic(() => import("@/components/settings/privacy-settings").then(m => m.PrivacySettings), { loading: PanelLoading, ssr: false });
const NotificationPreferences = dynamic(() => import("@/components/notifications/notification-preferences").then(m => m.NotificationPreferences), { loading: PanelLoading, ssr: false });
const SessionManager = dynamic(() => import("@/components/settings/session-manager").then(m => m.SessionManager), { loading: PanelLoading, ssr: false });
const VIPManager = dynamic(() => import("@/components/creator/vip-manager").then(m => m.VIPManager), { loading: PanelLoading, ssr: false });
const ModeratorManager = dynamic(() => import("@/components/creator/moderator-manager").then(m => m.ModeratorManager), { loading: PanelLoading, ssr: false });
const WelcomeMessageSettings = dynamic(() => import("@/components/creator/welcome-message-settings").then(m => m.WelcomeMessageSettings), { loading: PanelLoading, ssr: false });
const MassMessageComposer = dynamic(() => import("@/components/creator/mass-message-composer").then(m => m.MassMessageComposer), { loading: PanelLoading, ssr: false });
const MediaVault = dynamic(() => import("@/components/creator/media-vault").then(m => m.MediaVault), { loading: PanelLoading, ssr: false });
const CustomEmotesManager = dynamic(() => import("@/components/creator/custom-emotes-manager").then(m => m.CustomEmotesManager), { loading: PanelLoading, ssr: false });
const BlockedList = dynamic(() => import("@/components/settings/blocked-list").then(m => m.BlockedList), { loading: PanelLoading, ssr: false });
const MutedList = dynamic(() => import("@/components/settings/muted-list").then(m => m.MutedList), { loading: PanelLoading, ssr: false });
const HiddenPostsList = dynamic(() => import("@/components/settings/hidden-posts-list").then(m => m.HiddenPostsList), { loading: PanelLoading, ssr: false });
const VerificationRequest = dynamic(() => import("@/components/settings/verification-request").then(m => m.VerificationRequest), { loading: PanelLoading, ssr: false });
const PromoCodeManager = dynamic(() => import("@/components/creator/promo-code-manager").then(m => m.PromoCodeManager), { loading: PanelLoading, ssr: false });
const SubscriberBadgesManager = dynamic(() => import("@/components/creator/subscriber-badges").then(m => m.SubscriberBadgesManager), { loading: PanelLoading, ssr: false });
const TwoFactorSettings = dynamic(() => import("@/components/settings/two-factor-settings").then(m => m.TwoFactorSettings), { loading: PanelLoading, ssr: false });
const CreatorBansList = dynamic(() => import("@/components/settings/creator-bans-list").then(m => m.CreatorBansList), { loading: PanelLoading, ssr: false });
const MySubscriptions = dynamic(() => import("@/components/settings/my-subscriptions").then(m => m.MySubscriptions), { loading: PanelLoading, ssr: false });
const PremiumSettings = dynamic(() => import("@/components/settings/premium-settings").then(m => m.PremiumSettings), { loading: PanelLoading, ssr: false });
const PayoutSettings = dynamic(() => import("@/components/settings/payout-settings").then(m => m.PayoutSettings), { loading: PanelLoading, ssr: false });
const ReferralSettings = dynamic(() => import("@/components/settings/referral-settings").then(m => m.ReferralSettings), { loading: PanelLoading, ssr: false });
const SubscriptionTierManager = dynamic(() => import("@/components/creator/subscription-tier-manager").then(m => m.SubscriptionTierManager), { loading: PanelLoading, ssr: false });
const GiftInbox = dynamic(() => import("@/components/settings/gift-inbox").then(m => m.GiftInbox), { loading: PanelLoading, ssr: false });
const AdminDashboard = dynamic(() => import("@/components/admin/admin-dashboard").then(m => m.AdminDashboard), { loading: PanelLoading, ssr: false });

type Tab = "premium" | "analytics" | "stream" | "vips" | "moderators" | "welcome" | "mass" | "vault" | "emotes" | "notifications" | "privacy" | "sessions" | "blocked" | "muted" | "hidden" | "verification" | "admin" | "promo" | "badges" | "2fa" | "bans" | "subscriptions" | "tiers" | "payouts" | "referrals" | "gifts";

type NavItem = { id: Tab; label: string; icon: IconSvgElement };

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
    {
        label: "General",
        items: [
            { id: "analytics", label: "Analytics", icon: Analytics01Icon },
            { id: "premium", label: "Premium", icon: Crown02Icon },
            { id: "notifications", label: "Notifications", icon: Notification02Icon },
            { id: "privacy", label: "Privacy", icon: Shield01Icon },
        ],
    },
    {
        label: "Security",
        items: [
            { id: "sessions", label: "Sessions", icon: SecurityCheckIcon },
            { id: "2fa", label: "Two-factor auth", icon: SecurityLockIcon },
            { id: "verification", label: "Verification", icon: CheckmarkBadge01Icon },
        ],
    },
    {
        label: "Creator",
        items: [
            { id: "stream", label: "Stream", icon: PodcastIcon },
            { id: "vips", label: "VIP members", icon: Crown03Icon },
            { id: "moderators", label: "Moderators", icon: Shield02Icon },
            { id: "welcome", label: "Welcome message", icon: MessageAdd01Icon },
            { id: "mass", label: "Mass message", icon: SentIcon },
            { id: "vault", label: "Media vault", icon: Archive02Icon },
            { id: "emotes", label: "Emotes", icon: SmileIcon },
            { id: "promo", label: "Promo codes", icon: Tag01Icon },
            { id: "badges", label: "Badges", icon: Award01Icon },
            { id: "tiers", label: "Subscription tiers", icon: Layers01Icon },
        ],
    },
    {
        label: "Payments",
        items: [
            { id: "payouts", label: "Payouts", icon: Wallet01Icon },
            { id: "referrals", label: "Referrals", icon: Link01Icon },
            { id: "subscriptions", label: "My subscriptions", icon: FavouriteIcon },
            { id: "gifts", label: "Gift inbox", icon: GiftIcon },
        ],
    },
    {
        label: "Moderation",
        items: [
            { id: "blocked", label: "Blocked", icon: UserBlock01Icon },
            { id: "muted", label: "Muted", icon: VolumeMute02Icon },
            { id: "hidden", label: "Hidden posts", icon: ViewOffSlashIcon },
            { id: "bans", label: "Channel bans", icon: BanIcon },
        ],
    },
    {
        label: "Admin",
        items: [{ id: "admin", label: "Admin", icon: Flag02Icon }],
    },
];

const ALL_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

function StatCard({ label, value, icon, sub }: { label: string; value: string | number; icon: IconSvgElement; sub?: string }) {
    return (
        <Squircle asChild radius={20} autoEffects={false}>
            <div className="bg-panel p-5">
                <div className="mb-2 flex items-center gap-2 text-zinc-500">
                    <HugeiconsIcon icon={icon} className="size-4" strokeWidth={2} />
                    <span className="text-[13px] font-semibold">{label}</span>
                </div>
                <p className="text-2xl font-bold tabular-nums tracking-tight text-white">{value.toLocaleString()}</p>
                {sub && <p className="mt-0.5 text-[12px] font-medium text-zinc-600">{sub}</p>}
            </div>
        </Squircle>
    );
}

export default function SettingsPage() {
    const { data: session } = useAuthSession();
    const [tab, setTab] = useState<Tab>("analytics");

    const { data: analytics, isLoading } = trpc.user.getAnalytics.useQuery(undefined, { enabled: !!session?.user });

    const active = ALL_ITEMS.find((i) => i.id === tab);

    return (
        <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 pb-10 pt-6 md:pt-[calc(var(--header-height)+16px)] lg:px-6">
            {/* Vertical section rail (desktop) */}
            <nav className="sticky top-[calc(var(--header-height)+16px)] hidden max-h-[calc(100svh-var(--header-height)-32px)] w-56 shrink-0 self-start overflow-y-auto hidden-scrollbar md:block">
                <div className="flex flex-col gap-5">
                    {NAV_GROUPS.map((group) => (
                        <div key={group.label}>
                            <p className="px-3.5 pb-1.5 text-[12px] font-semibold text-zinc-600">{group.label}</p>
                            <div className="flex flex-col gap-0.5">
                                {group.items.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => setTab(item.id)}
                                        className={cn(
                                            "flex cursor-pointer items-center gap-2.5 rounded-full px-3.5 py-2 text-left text-[14px] font-semibold transition-colors",
                                            tab === item.id
                                                ? "bg-white text-black"
                                                : "text-zinc-400 hover:bg-white/5 hover:text-white",
                                        )}
                                    >
                                        <HugeiconsIcon icon={item.icon} className="size-4 shrink-0" strokeWidth={2} />
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </nav>

            {/* Content */}
            <div className="min-w-0 flex-1">
                {/* Mobile section picker */}
                <div className="mb-5 md:hidden">
                    <GooDropdown
                        align="start"
                        width={248}
                        gap={8}
                        fill="#101011"
                        panelRadius={20}
                        itemHeight={40}
                        maxPanelHeight={440}
                        triggerAriaLabel="Settings section"
                        triggerClassName="flex h-11 cursor-pointer items-center gap-2 rounded-full bg-white/5 px-4 text-[15px] font-bold text-white transition-colors hover:bg-white/10"
                        trigger={
                            <>
                                {active && <HugeiconsIcon icon={active.icon} className="size-4" strokeWidth={2} />}
                                {active?.label}
                                <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 text-zinc-500" strokeWidth={2} />
                            </>
                        }
                        items={NAV_GROUPS.flatMap((group) => [
                            { key: `label-${group.label}`, type: "label" as const, label: group.label, height: 30 },
                            ...group.items.map((item) => ({
                                key: item.id,
                                onClick: () => setTab(item.id),
                                className: cn(
                                    "gap-2.5 px-3 rounded-full cursor-pointer text-sm font-semibold",
                                    tab === item.id ? "bg-white/10 text-white" : "text-zinc-300 hover:bg-white/5 hover:text-white",
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
                </div>

                {tab === "analytics" && (
                    <div className="space-y-4">
                        {isLoading ? (
                            <div className="grid grid-cols-2 gap-3">
                                {Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="h-24 overflow-hidden rounded-[20px]"><div className="size-full shimmer-skeleton" /></div>
                                ))}
                            </div>
                        ) : analytics ? (
                            <>
                                <AnalyticsCharts />
                                <div className="grid grid-cols-2 gap-3">
                                    <StatCard label="Followers" value={analytics.followers} icon={UserGroup02Icon} />
                                    <StatCard label="Following" value={analytics.following} icon={UserGroup02Icon} />
                                    <StatCard label="Total posts" value={analytics.totalPosts} icon={Analytics01Icon} />
                                    <StatCard label="Total views" value={analytics.totalViews} icon={EyeIcon} />
                                    <StatCard label="Total likes" value={analytics.totalLikes} icon={FavouriteIcon} />
                                    <StatCard label="Avg views/post" value={analytics.totalPosts > 0 ? Math.round(analytics.totalViews / analytics.totalPosts) : 0} icon={EyeIcon} />
                                </div>

                                {analytics.topPosts.length > 0 && (
                                    <Squircle asChild radius={24} autoEffects={false}>
                                        <div className="bg-panel">
                                            <p className="px-4 pb-1 pt-4 text-[14px] font-semibold text-zinc-500">Top posts</p>
                                            {analytics.topPosts.map((post) => (
                                                <div key={post.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.04]">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-[14px] font-medium text-zinc-200">{post.content || "Media post"}</p>
                                                    </div>
                                                    <div className="flex shrink-0 items-center gap-3 text-[12px] font-medium text-zinc-500">
                                                        <span className="flex items-center gap-1"><HugeiconsIcon icon={EyeIcon} className="size-3" strokeWidth={2} />{post.views}</span>
                                                        <span className="flex items-center gap-1"><HugeiconsIcon icon={FavouriteIcon} className="size-3" strokeWidth={2} />{post.likes}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </Squircle>
                                )}
                            </>
                        ) : null}
                    </div>
                )}

                {tab === "premium" && <PremiumSettings />}
                {tab === "stream" && <StreamSettings />}
                {tab === "privacy" && <PrivacySettings />}
                {tab === "notifications" && <NotificationPreferences />}
                {tab === "sessions" && <SessionManager />}
                {tab === "vips" && <VIPManager />}
                {tab === "moderators" && <ModeratorManager />}
                {tab === "welcome" && <WelcomeMessageSettings />}
                {tab === "mass" && <MassMessageComposer />}
                {tab === "vault" && <MediaVault />}
                {tab === "emotes" && <CustomEmotesManager />}
                {tab === "blocked" && <BlockedList />}
                {tab === "muted" && <MutedList />}
                {tab === "hidden" && <HiddenPostsList />}
                {tab === "verification" && <VerificationRequest />}
                {tab === "promo" && <PromoCodeManager />}
                {tab === "badges" && <SubscriberBadgesManager />}
                {tab === "2fa" && <TwoFactorSettings />}
                {tab === "bans" && <CreatorBansList />}
                {tab === "tiers" && session?.user && <SubscriptionTierManager creatorId={session.user.id} />}
                {tab === "subscriptions" && <MySubscriptions />}
                {tab === "payouts" && <PayoutSettings />}
                {tab === "referrals" && <ReferralSettings />}
                {tab === "gifts" && <GiftInbox />}
                {tab === "admin" && <AdminDashboard />}
            </div>
        </div>
    );
}
