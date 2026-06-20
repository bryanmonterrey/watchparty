"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { BarChart2, Users, Eye, Heart, Crown, Shield, MessageSquarePlus, Send, Smile, Vault, Bell, Ban, VolumeX, EyeOff, ShieldCheck, Radio, BadgeCheck, Flag, Tag, Award, Wallet, Gift, Link2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Port of sidebar's (browse)/settings/page.tsx, with two changes:
// - Every tab panel loads via next/dynamic, so /settings ships only the tab
//   you open instead of all ~25 managers (analytics charts included — they
//   pull a chart lib). Sidebar imported everything eagerly.
// - The client-side `redirect("/")` guard is gone; the (app) layout guards.

function PanelLoading() {
    return (
        <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
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

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "premium", label: "Premium", icon: <Crown className="w-4 h-4" /> },
    { id: "analytics", label: "Analytics", icon: <BarChart2 className="w-4 h-4" /> },
    { id: "stream", label: "Stream", icon: <Radio className="w-4 h-4" /> },
    { id: "privacy", label: "Privacy", icon: <Shield className="w-4 h-4" /> },
    { id: "notifications", label: "Notifications", icon: <Bell className="w-4 h-4" /> },
    { id: "sessions", label: "Sessions", icon: <ShieldCheck className="w-4 h-4" /> },
    { id: "2fa", label: "Two-Factor Auth", icon: <ShieldCheck className="w-4 h-4" /> },
    { id: "blocked", label: "Blocked", icon: <Ban className="w-4 h-4" /> },
    { id: "bans", label: "Channel Bans", icon: <Ban className="w-4 h-4" /> },
    { id: "muted", label: "Muted", icon: <VolumeX className="w-4 h-4" /> },
    { id: "hidden", label: "Hidden Posts", icon: <EyeOff className="w-4 h-4" /> },
    { id: "verification", label: "Verification", icon: <BadgeCheck className="w-4 h-4" /> },
    { id: "vips", label: "VIP Members", icon: <Crown className="w-4 h-4" /> },
    { id: "moderators", label: "Moderators", icon: <Shield className="w-4 h-4" /> },
    { id: "welcome", label: "Welcome Msg", icon: <MessageSquarePlus className="w-4 h-4" /> },
    { id: "mass", label: "Mass Message", icon: <Send className="w-4 h-4" /> },
    { id: "vault", label: "Media Vault", icon: <Vault className="w-4 h-4" /> },
    { id: "emotes", label: "Emotes", icon: <Smile className="w-4 h-4" /> },
    { id: "promo", label: "Promo Codes", icon: <Tag className="w-4 h-4" /> },
    { id: "badges", label: "Badges", icon: <Award className="w-4 h-4" /> },
    { id: "tiers", label: "Sub Tiers", icon: <Crown className="w-4 h-4" /> },
    { id: "subscriptions", label: "My Subs", icon: <Crown className="w-4 h-4" /> },
    { id: "payouts", label: "Payouts", icon: <Wallet className="w-4 h-4" /> },
    { id: "referrals", label: "Referrals", icon: <Link2 className="w-4 h-4" /> },
    { id: "gifts", label: "Gift Inbox", icon: <Gift className="w-4 h-4" /> },
    { id: "admin", label: "Admin", icon: <Flag className="w-4 h-4" /> },
];

function StatCard({ label, value, icon, sub }: { label: string; value: string | number; icon: React.ReactNode; sub?: string }) {
    return (
        <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4">
            <div className="flex items-center gap-2 text-zinc-500 mb-2">
                {icon}
                <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
            </div>
            <p className="text-2xl font-bold text-zinc-100">{value.toLocaleString()}</p>
            {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
        </div>
    );
}

export default function SettingsPage() {
    const { data: session } = useAuthSession();
    const [tab, setTab] = useState<Tab>("analytics");

    const { data: analytics, isLoading } = trpc.user.getAnalytics.useQuery(undefined, { enabled: !!session?.user });

    return (
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            <h1 className="text-xl font-bold text-zinc-100">Settings</h1>

            {/* Tab nav */}
            <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-1">
                {TABS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${tab === t.id ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5"}`}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            {tab === "analytics" && (
                <div className="space-y-4">
                    {isLoading ? (
                        <div className="grid grid-cols-2 gap-3">
                            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
                        </div>
                    ) : analytics ? (
                        <>
                            <AnalyticsCharts />
                            <div className="grid grid-cols-2 gap-3">
                                <StatCard label="Followers" value={analytics.followers} icon={<Users className="w-4 h-4" />} />
                                <StatCard label="Following" value={analytics.following} icon={<Users className="w-4 h-4" />} />
                                <StatCard label="Total Posts" value={analytics.totalPosts} icon={<BarChart2 className="w-4 h-4" />} />
                                <StatCard label="Total Views" value={analytics.totalViews} icon={<Eye className="w-4 h-4" />} />
                                <StatCard label="Total Likes" value={analytics.totalLikes} icon={<Heart className="w-4 h-4" />} />
                                <StatCard label="Avg Views/Post" value={analytics.totalPosts > 0 ? Math.round(analytics.totalViews / analytics.totalPosts) : 0} icon={<Eye className="w-4 h-4" />} />
                            </div>

                            {analytics.topPosts.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-sm font-semibold text-zinc-300">Top Posts</p>
                                    {analytics.topPosts.map((post) => (
                                        <div key={post.id} className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/60 border border-white/10">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-zinc-200 truncate">{post.content || "Media post"}</p>
                                            </div>
                                            <div className="flex items-center gap-3 text-xs text-zinc-500 shrink-0">
                                                <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{post.views}</span>
                                                <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{post.likes}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
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
    );
}
