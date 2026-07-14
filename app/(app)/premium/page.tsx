"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { motion, useReducedMotion } from "motion/react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { usePremiumOverlay } from "@/lib/premium/overlay-store";
import { TIERS, type TierKey } from "@/lib/premium/tiers";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
    Analytics01Icon,
    Archive02Icon,
    ArrowUpRight01Icon,
    CheckmarkBadge01Icon,
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
import { cn } from "@/lib/utils";
import { VerifiedBadgeIcon } from "@/components/icons";
import { Panel } from "@/components/settings/ui";

// Premium hub — two-column: persistent left rail (double-bezel plan banner +
// grouped rows with LIVE data signals) and the active section on the right
// (?s=, nuqs, lazy panels). The page title is a static "Premium" in the app
// header. Checkout stays in the global UpgradeOverlay — non-subscribers who
// land here get the overlay popped over the hub. "hub" is a legacy alias for
// the default section (plan).

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
type HubGroup = { label: string; rows: HubRow[] };

// Icon chips stay neutral (white on faint gray) — accent color is reserved
// for live semantics in the row signals (lantern money, pastelred LIVE).
const HUB_GROUPS: HubGroup[] = [
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

// ── Live signals — the hub reads as a living surface, not a link list ───────

function formatCount(n: number) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
    return n.toLocaleString();
}

function useHubSignals(enabled: boolean) {
    const { data: claimable } = trpc.subscription.getClaimable.useQuery(undefined, { enabled });
    const { data: stream } = trpc.stream.getMine.useQuery(undefined, { enabled });
    const { data: gifts } = trpc.subscription.getMyGifts.useQuery(undefined, { enabled });
    const { data: subs } = trpc.subscription.getMySubscriptions.useQuery(undefined, { enabled });
    const { data: analytics } = trpc.user.getAnalytics.useQuery(undefined, { enabled });
    return { claimable, stream, gifts, subs, analytics };
}

function RowSignal({ s, signals }: { s: Section; signals: ReturnType<typeof useHubSignals> }) {
    if (s === "payouts" && (signals.claimable?.netUsdc ?? 0) > 0) {
        return <span className="text-[13px] font-bold tabular-nums text-lantern">${(signals.claimable!.netUsdc / 1_000_000).toFixed(2)}</span>;
    }
    if (s === "stream" && signals.stream?.isLive) {
        return (
            <span className="flex items-center gap-1 rounded-full bg-pastelred/15 px-2 py-0.5 text-[11px] font-bold tracking-wide text-pastelred">
                <span className="size-1.5 animate-pulse rounded-full bg-pastelred" />
                LIVE
            </span>
        );
    }
    if (s === "gifts" && (signals.gifts?.length ?? 0) > 0) {
        return <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">{signals.gifts!.length}</span>;
    }
    if (s === "subscriptions" && (signals.subs?.length ?? 0) > 0) {
        return <span className="text-[12px] font-semibold tabular-nums text-zinc-500">{signals.subs!.length} active</span>;
    }
    if (s === "analytics" && signals.analytics) {
        return <span className="text-[12px] font-semibold tabular-nums text-zinc-500">{formatCount(signals.analytics.followers)} followers</span>;
    }
    return null;
}

// ── Hub pieces ──────────────────────────────────────────────────────────────

// Double-bezel hero: outer tray + flat inner plate (no gradients, no glow,
// no inset highlights — user rule). Subscribers click through to plan
// management; everyone else opens the overlay.
function PlanBanner({ onManage }: { onManage: () => void }) {
    const { data, isLoading } = trpc.premium.getStatus.useQuery();
    const openOverlay = usePremiumOverlay((s) => s.openOverlay);

    if (isLoading) {
        return <div className="h-[104px] overflow-hidden rounded-[1.75rem]"><div className="size-full shimmer-skeleton" /></div>;
    }

    const sub = data?.subscription;
    const entitled = !!(data?.entitled && sub);
    const tier = entitled ? TIERS[sub!.tierKey as TierKey] : undefined;

    return (
        <button
            onClick={entitled ? onManage : () => openOverlay()}
            className="group block w-full cursor-pointer rounded-[1.75rem] bg-white/[0.03] p-1.5 text-left ring-1 ring-white/10 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99]"
        >
            <div className="relative flex items-center justify-between gap-4 overflow-hidden rounded-[calc(1.75rem-0.375rem)] bg-zinc-900 p-5">
                <div className="relative flex min-w-0 items-center gap-4">
                    <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
                        <VerifiedBadgeIcon className="size-5" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[15px] font-bold tracking-tight text-white">
                            {entitled ? (tier?.name ?? sub!.tierKey) : "You're not on Premium"}
                        </p>
                        <p className="mt-0.5 text-[12px] font-medium text-zinc-500">
                            {entitled ? (
                                <span className="capitalize">{sub!.billingCycle} · {sub!.cancelAtPeriodEnd ? "ends" : "renews"} {new Date(sub!.currentPeriodEnd).toLocaleDateString()}</span>
                            ) : (
                                "Verified badge, ad-free viewing, ad credits and more"
                            )}
                        </p>
                    </div>
                </div>
                {entitled ? (
                    <div className="relative grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-zinc-300 ring-1 ring-white/10 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:bg-white group-hover:text-black group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                        <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-4" strokeWidth={1.75} />
                    </div>
                ) : (
                    <span className="relative inline-flex h-10 shrink-0 items-center rounded-full bg-white px-4 text-[13px] font-bold text-black transition-colors group-hover:bg-white/90">
                        See plans
                    </span>
                )}
            </div>
        </button>
    );
}

function HubRowItem({ row, active, onOpen, signals }: {
    row: HubRow;
    active: boolean;
    onOpen: (s: Section) => void;
    signals: ReturnType<typeof useHubSignals>;
}) {
    return (
        <button
            onClick={() => onOpen(row.s)}
            className={cn(
                "group flex w-full cursor-pointer items-center gap-3 rounded-[18px] px-3 py-2.5 text-left transition-colors",
                active ? "bg-white/[0.06]" : "hover:bg-white/[0.04] active:bg-white/[0.06]",
            )}
        >
            <span className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors group-active:scale-95",
                active ? "bg-white text-black" : "bg-white/[0.06] text-zinc-300 group-hover:text-white",
            )}>
                <HugeiconsIcon icon={row.icon} className="size-4.5" strokeWidth={2} />
            </span>
            <div className="min-w-0 flex-1">
                <p className={cn("truncate text-[14px] font-bold tracking-tight", active ? "text-white" : "text-zinc-200")}>{row.label}</p>
            </div>
            <RowSignal s={row.s} signals={signals} />
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
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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

const EASE = [0.32, 0.72, 0, 1] as const;

export default function PremiumPage() {
    const [rawSection, setSection] = useQueryState("s", sectionParser);
    // "hub" predates the two-column layout — treat it as the default section.
    const section: Exclude<Section, "hub"> = rawSection === "hub" ? "plan" : rawSection;
    const { data: session } = useAuthSession();
    const reduceMotion = useReducedMotion();

    // Non-subscribers get the overlay popped over the hub (sidebar clicks are
    // intercepted too — this covers deep links and the loading race).
    const { data: status } = trpc.premium.getStatus.useQuery(undefined, { enabled: !!session?.user });
    const openOverlay = usePremiumOverlay((s) => s.openOverlay);
    const notEntitled = !!status && !status.entitled;
    useEffect(() => {
        if (notEntitled) openOverlay();
        // Pop once when status resolves un-entitled; closing it leaves the
        // hub (with its upsell banner) usable behind.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [notEntitled]);

    const signals = useHubSignals(!!session?.user);

    return (
        <div className="flex w-full gap-12 px-(--header-px) pb-16 pt-6 md:pt-[calc(var(--header-height)+16px)]">
            {/* Left rail — plan banner + grouped sections, always visible */}
            <aside className="w-80 shrink-0 max-lg:w-72 max-md:hidden">
                <div className="sticky top-[calc(var(--header-height)+16px)] -m-2 max-h-[calc(100vh-var(--header-height)-24px)] overflow-y-auto p-2 pb-4 hidden-scrollbar">
                    <PlanBanner onManage={() => setSection("plan")} />
                    {HUB_GROUPS.map((group, gi) => (
                        <motion.section
                            key={group.label}
                            initial={reduceMotion ? false : { opacity: 0, y: 14 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05 + gi * 0.07, duration: 0.45, ease: EASE }}
                            className="mt-6"
                        >
                            <h2 className="mb-1 px-3 text-[13px] font-semibold text-zinc-500">{group.label}</h2>
                            {group.rows.map((row) => (
                                <HubRowItem key={row.s} row={row} active={section === row.s} onOpen={setSection} signals={signals} />
                            ))}
                        </motion.section>
                    ))}
                </div>
            </aside>

            {/* Active section */}
            <motion.div
                key={section}
                initial={reduceMotion ? false : { opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="min-w-0 max-w-4xl flex-1"
            >
                <h1 className="mb-5 text-[20px] font-bold tracking-tight text-white">{SECTION_TITLES[section]}</h1>
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
            </motion.div>
        </div>
    );
}
