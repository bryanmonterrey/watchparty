"use client";

import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
    Analytics01Icon,
    EyeIcon,
    FavouriteIcon,
    UserGroup02Icon,
} from "@hugeicons/core-free-icons";
import { Squircle } from "@/components/ui/squircle";
import { ALL_SETTINGS_ITEMS, itemOwnsTab, useSettingsTab } from "@/components/settings/settings-nav";
import { cn } from "@/lib/utils";

// Port of sidebar's (browse)/settings/page.tsx, with two changes:
// - Every tab panel loads via next/dynamic, so /settings ships only the tab
//   you open instead of all ~25 managers (analytics charts included — they
//   pull a chart lib). Sidebar imported everything eagerly.
// - The client-side `redirect("/")` guard is gone; the (app) layout guards.
//
// Shell design mirrors /trade: the page title in the app header IS the nav
// (SettingsNav goo dropdown, ?tab= via nuqs), sub-sections render as a pill
// row above the content, and content sits in bg-panel squircles.

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
const ProfileSettings = dynamic(() => import("@/components/auth/profile-settings"), { loading: PanelLoading, ssr: false });
const AccountLinking = dynamic(() => import("@/components/auth/account-linking"), { loading: PanelLoading, ssr: false });
const WalletManagement = dynamic(() => import("@/components/auth/wallet-management"), { loading: PanelLoading, ssr: false });
const PasskeyManager = dynamic(() => import("@/components/auth/passkey-manager"), { loading: PanelLoading, ssr: false });
const SecurityAuditLog = dynamic(() => import("@/components/auth/security-audit-log"), { loading: PanelLoading, ssr: false });

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
    const [tab, setTab] = useSettingsTab();

    const { data: analytics, isLoading } = trpc.user.getAnalytics.useQuery(undefined, { enabled: !!session?.user });

    const isAdmin = session?.user?.role === "admin";

    const active = ALL_SETTINGS_ITEMS.find((i) => itemOwnsTab(i, tab));

    return (
        <div className="w-full max-w-4xl px-4 pb-10 pt-6 md:pt-[calc(var(--header-height)+16px)]">
            {/* Section switching lives in the app header (SettingsNav) */}
            <div className="min-w-0">
                {/* Sub-section pills for consolidated nav items */}
                {active?.subs && (
                    <div className="mb-5 flex flex-wrap gap-1.5">
                        {active.subs.map((sub) => (
                            <button
                                key={sub.id}
                                onClick={() => setTab(sub.id)}
                                className={cn(
                                    "h-9 cursor-pointer rounded-full px-4 text-[13px] font-semibold transition-colors",
                                    tab === sub.id
                                        ? "bg-white text-black"
                                        : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white",
                                )}
                            >
                                {sub.label}
                            </button>
                        ))}
                    </div>
                )}

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

                {tab === "profile" && <ProfileSettings />}
                {tab === "linked" && <AccountLinking />}
                {tab === "wallets" && <WalletManagement />}
                {tab === "passkeys" && <PasskeyManager />}
                {tab === "audit" && <SecurityAuditLog />}
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
                {tab === "admin" && isAdmin && <AdminDashboard />}
            </div>
        </div>
    );
}
