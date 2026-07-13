"use client";

import dynamic from "next/dynamic";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { usePremiumOverlay } from "@/lib/premium/overlay-store";
import { TIERS, type TierKey } from "@/lib/premium/tiers";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
    Analytics01Icon,
    Archive02Icon,
    ArrowLeft01Icon,
    ArrowRight01Icon,
    CheckmarkBadge01Icon,
    Crown02Icon,
    EyeIcon,
    FavouriteIcon,
    GiftIcon,
    Layers01Icon,
    Megaphone02Icon,
    MessageAdd01Icon,
    PodcastIcon,
    RepeatIcon,
    Shield01Icon,
    SmileIcon,
    Ticket01Icon,
    UserAdd01Icon,
    UserBlock01Icon,
    UserGroup02Icon,
    Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { Squircle } from "@/components/ui/squircle";
import { Panel, PillButton } from "@/components/settings/ui";

// Premium hub — X-Premium-style drill-down. The hub is a vertical menu of
// grouped rows (plan banner up top, chevron rows below); each row swaps the
// column for that section (?s=, nuqs) with a back arrow, like X's
// Premium → Creator Studio → Analytics flow. Checkout stays in the global
// UpgradeOverlay so there's one transactional path.

const SECTIONS = [
    "hub", "plan",
    "analytics", "payouts", "stream", "vault",
    "tiers", "badges", "promo", "referrals",
    "vips", "moderators", "bans", "emotes", "welcome", "mass",
    "subscriptions", "gifts",
] as const;
type Section = (typeof SECTIONS)[number];

const sectionParser = parseAsStringLiteral(SECTIONS).withDefault("hub");

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
const PremiumSettings = dynamic(() => import("@/components/settings/premium-settings").then(m => m.PremiumSettings), { loading: PanelLoading, ssr: false });
const AnalyticsCharts = dynamic(() => import("@/components/settings/analytics-charts").then(m => m.AnalyticsCharts), { loading: PanelLoading, ssr: false });
const PayoutSettings = dynamic(() => import("@/components/settings/payout-settings").then(m => m.PayoutSettings), { loading: PanelLoading, ssr: false });
const ReferralSettings = dynamic(() => import("@/components/settings/referral-settings").then(m => m.ReferralSettings), { loading: PanelLoading, ssr: false });
const StreamSettings = dynamic(() => import("@/components/settings/stream-settings").then(m => m.StreamSettings), { loading: PanelLoading, ssr: false });
const MediaVault = dynamic(() => import("@/components/creator/media-vault").then(m => m.MediaVault), { loading: PanelLoading, ssr: false });
const SubscriptionTierManager = dynamic(() => import("@/components/creator/subscription-tier-manager").then(m => m.SubscriptionTierManager), { loading: PanelLoading, ssr: false });
const SubscriberBadgesManager = dynamic(() => import("@/components/creator/subscriber-badges").then(m => m.SubscriberBadgesManager), { loading: PanelLoading, ssr: false });
const PromoCodeManager = dynamic(() => import("@/components/creator/promo-code-manager").then(m => m.PromoCodeManager), { loading: PanelLoading, ssr: false });
const VIPManager = dynamic(() => import("@/components/creator/vip-manager").then(m => m.VIPManager), { loading: PanelLoading, ssr: false });
const ModeratorManager = dynamic(() => import("@/components/creator/moderator-manager").then(m => m.ModeratorManager), { loading: PanelLoading, ssr: false });
const CreatorBansList = dynamic(() => import("@/components/settings/creator-bans-list").then(m => m.CreatorBansList), { loading: PanelLoading, ssr: false });
const CustomEmotesManager = dynamic(() => import("@/components/creator/custom-emotes-manager").then(m => m.CustomEmotesManager), { loading: PanelLoading, ssr: false });
const WelcomeMessageSettings = dynamic(() => import("@/components/creator/welcome-message-settings").then(m => m.WelcomeMessageSettings), { loading: PanelLoading, ssr: false });
const MassMessageComposer = dynamic(() => import("@/components/creator/mass-message-composer").then(m => m.MassMessageComposer), { loading: PanelLoading, ssr: false });
const MySubscriptions = dynamic(() => import("@/components/settings/my-subscriptions").then(m => m.MySubscriptions), { loading: PanelLoading, ssr: false });
const GiftInbox = dynamic(() => import("@/components/settings/gift-inbox").then(m => m.GiftInbox), { loading: PanelLoading, ssr: false });

// ── Hub menu config ─────────────────────────────────────────────────────────

type HubRow = { s: Section; icon: IconSvgElement; label: string; desc: string };

const HUB_GROUPS: { label: string; rows: HubRow[] }[] = [
    {
        label: "Quick access",
        rows: [
            { s: "analytics", icon: Analytics01Icon, label: "Analytics", desc: "Followers, views and engagement" },
            { s: "payouts", icon: Wallet01Icon, label: "Earnings", desc: "Claim and track your payouts" },
            { s: "stream", icon: PodcastIcon, label: "Live studio", desc: "Stream key, OBS setup and info" },
            { s: "vault", icon: Archive02Icon, label: "Media vault", desc: "Your uploads in one place" },
        ],
    },
    {
        label: "Monetization",
        rows: [
            { s: "tiers", icon: Layers01Icon, label: "Subscription tiers", desc: "Price and perks for your subs" },
            { s: "badges", icon: CheckmarkBadge01Icon, label: "Subscriber badges", desc: "Loyalty badges by tenure" },
            { s: "promo", icon: Ticket01Icon, label: "Promo codes", desc: "Discounts for your subscriptions" },
            { s: "referrals", icon: UserAdd01Icon, label: "Referrals", desc: "Earn by inviting friends" },
        ],
    },
    {
        label: "Community",
        rows: [
            { s: "vips", icon: FavouriteIcon, label: "VIP members", desc: "Your channel's inner circle" },
            { s: "moderators", icon: Shield01Icon, label: "Moderators", desc: "Who keeps your chat safe" },
            { s: "bans", icon: UserBlock01Icon, label: "Channel bans", desc: "Users banned from your channel" },
            { s: "emotes", icon: SmileIcon, label: "Custom emotes", desc: "Emotes for your subscribers" },
            { s: "welcome", icon: MessageAdd01Icon, label: "Welcome message", desc: "Greet new followers automatically" },
            { s: "mass", icon: Megaphone02Icon, label: "Mass message", desc: "Message all your subscribers" },
        ],
    },
    {
        label: "Your subscriptions",
        rows: [
            { s: "subscriptions", icon: RepeatIcon, label: "My subscriptions", desc: "Creators you support" },
            { s: "gifts", icon: GiftIcon, label: "Gift inbox", desc: "Redeem gifted subscriptions" },
        ],
    },
];

const SECTION_TITLES: Record<Exclude<Section, "hub">, string> = {
    plan: "Your plan",
    analytics: "Analytics",
    payouts: "Earnings",
    stream: "Live studio",
    vault: "Media vault",
    tiers: "Subscription tiers",
    badges: "Subscriber badges",
    promo: "Promo codes",
    referrals: "Referrals",
    vips: "VIP members",
    moderators: "Moderators",
    bans: "Channel bans",
    emotes: "Custom emotes",
    welcome: "Welcome message",
    mass: "Mass message",
    subscriptions: "My subscriptions",
    gifts: "Gift inbox",
};

// ── Hub pieces ──────────────────────────────────────────────────────────────

function PlanBanner({ onManage }: { onManage: () => void }) {
    const { data, isLoading } = trpc.premium.getStatus.useQuery();
    const openOverlay = usePremiumOverlay((s) => s.openOverlay);

    if (isLoading) {
        return <div className="h-24 overflow-hidden rounded-[24px]"><div className="size-full shimmer-skeleton" /></div>;
    }

    const sub = data?.subscription;
    if (data?.entitled && sub) {
        const tier = TIERS[sub.tierKey as TierKey];
        return (
            <Squircle asChild radius={24} autoEffects={false}>
                <button
                    onClick={onManage}
                    className="group flex w-full cursor-pointer items-center gap-4 bg-panel p-5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,.06)] transition-colors hover:bg-white/[0.06]"
                >
                    <div className="grid size-11 shrink-0 place-items-center rounded-full bg-twitter/10 text-twitter">
                        <HugeiconsIcon icon={Crown02Icon} className="size-5" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold tracking-tight text-white">{tier?.name ?? sub.tierKey}</p>
                        <p className="text-[12px] font-medium capitalize text-zinc-500">
                            {sub.billingCycle} · {sub.cancelAtPeriodEnd ? "ends" : "renews"} {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                        </p>
                    </div>
                    <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
                </button>
            </Squircle>
        );
    }

    return (
        <Panel className="flex items-center gap-4 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-twitter/10 text-twitter">
                <HugeiconsIcon icon={Crown02Icon} className="size-5" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold tracking-tight text-white">You&apos;re not on Premium</p>
                <p className="text-[12px] font-medium text-zinc-500">Verified badge, ad-free viewing, ad credits and more.</p>
            </div>
            <PillButton variant="primary" onClick={() => openOverlay()}>See plans</PillButton>
        </Panel>
    );
}

function HubRowItem({ row, onOpen }: { row: HubRow; onOpen: (s: Section) => void }) {
    return (
        <button
            onClick={() => onOpen(row.s)}
            className="group flex w-full cursor-pointer items-center gap-4 rounded-[18px] px-3 py-3 text-left transition-colors hover:bg-white/[0.04] active:bg-white/[0.06]"
        >
            <HugeiconsIcon icon={row.icon} className="size-5 shrink-0 text-zinc-300" strokeWidth={2} />
            <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold tracking-tight text-white">{row.label}</p>
                <p className="text-[12px] font-medium text-zinc-500">{row.desc}</p>
            </div>
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-zinc-600 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
        </button>
    );
}

// Analytics = charts + totals + top posts (moved here from /settings).
function StatCard({ label, value, icon }: { label: string; value: string | number; icon: IconSvgElement }) {
    return (
        <Panel className="p-5">
            <div className="mb-2 flex items-center gap-2 text-zinc-500">
                <HugeiconsIcon icon={icon} className="size-4" strokeWidth={2} />
                <span className="text-[13px] font-semibold">{label}</span>
            </div>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-white">{value.toLocaleString()}</p>
        </Panel>
    );
}

function AnalyticsSection() {
    const { data: session } = useAuthSession();
    const { data: analytics, isLoading } = trpc.user.getAnalytics.useQuery(undefined, { enabled: !!session?.user });

    if (isLoading) {
        return (
            <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-24 overflow-hidden rounded-[20px]"><div className="size-full shimmer-skeleton" /></div>
                ))}
            </div>
        );
    }
    if (!analytics) return null;

    return (
        <div className="space-y-4">
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
                <Panel className="pb-1.5">
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
                </Panel>
            )}
        </div>
    );
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function PremiumPage() {
    const [section, setSection] = useQueryState("s", sectionParser);
    const { data: session } = useAuthSession();

    if (section === "hub") {
        return (
            <div className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6 md:pt-[calc(var(--header-height)+16px)]">
                <h1 className="mb-5 text-[20px] font-bold tracking-tight text-white">Premium</h1>
                <PlanBanner onManage={() => setSection("plan")} />
                {HUB_GROUPS.map((group) => (
                    <section key={group.label} className="mt-7">
                        <h2 className="mb-1 px-3 text-[16px] font-bold tracking-tight text-white">{group.label}</h2>
                        {group.rows.map((row) => (
                            <HubRowItem key={row.s} row={row} onOpen={setSection} />
                        ))}
                    </section>
                ))}
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 md:pt-[calc(var(--header-height)+16px)]">
            <div className="mb-5 flex items-center gap-2">
                <button
                    onClick={() => setSection("hub")}
                    aria-label="Back to Premium"
                    className="grid size-10 cursor-pointer place-items-center rounded-full text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                    <HugeiconsIcon icon={ArrowLeft01Icon} className="size-5" strokeWidth={2} />
                </button>
                <h1 className="text-[20px] font-bold tracking-tight text-white">{SECTION_TITLES[section]}</h1>
            </div>

            {section === "plan" && <PremiumSettings />}
            {section === "analytics" && <AnalyticsSection />}
            {section === "payouts" && <PayoutSettings />}
            {section === "referrals" && <ReferralSettings />}
            {section === "stream" && <StreamSettings />}
            {section === "vault" && <MediaVault />}
            {section === "tiers" && session?.user && <SubscriptionTierManager creatorId={session.user.id} />}
            {section === "badges" && <SubscriberBadgesManager />}
            {section === "promo" && <PromoCodeManager />}
            {section === "vips" && <VIPManager />}
            {section === "moderators" && <ModeratorManager />}
            {section === "bans" && <CreatorBansList />}
            {section === "emotes" && <CustomEmotesManager />}
            {section === "welcome" && <WelcomeMessageSettings />}
            {section === "mass" && <MassMessageComposer />}
            {section === "subscriptions" && <MySubscriptions />}
            {section === "gifts" && <GiftInbox />}
        </div>
    );
}
