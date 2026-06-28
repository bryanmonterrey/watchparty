"use client";

import { trpc } from "@/lib/trpc/client";
import { usePremiumOverlay } from "@/lib/premium/overlay-store";
import {
    TIERS,
    INDIVIDUAL_TIERS,
    priceUsd,
    formatUsd,
    ANNUAL_MONTHS_FREE,
    type TierKey,
} from "@/lib/premium/tiers";
import { appToast } from "@/components/app-ui/app-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
    BadgeCheck, Check, Loader2, Crown, ArrowUpRight, Megaphone,
    Sparkles, BarChart3, Coins, Ban, Upload, Wand2,
} from "lucide-react";

// Premium hub at /premium (the sidebar "Premium" nav target). The actual
// subscribe + compare-table flow lives in the global UpgradeOverlay; this page
// markets premium and, for subscribers, surfaces plan management — opening the
// overlay for anything transactional so there's one checkout path.

const HIGHLIGHTS = [
    { icon: BadgeCheck, title: "Verified badge", body: "Stand out with a checkmark on your profile and replies." },
    { icon: Ban, title: "Ad-free viewing", body: "Watch without interruptions across the whole app." },
    { icon: Coins, title: "Creator payouts", body: "Earn from subscriptions and get paid to post." },
    { icon: BarChart3, title: "Analytics & insights", body: "Understand your audience and what's working." },
    { icon: Upload, title: "Higher limits", body: "Longer posts, bigger uploads, and the largest reply boost." },
    { icon: Megaphone, title: "Ad credits", body: "A monthly ad-credit allowance to promote your content." },
];

export default function PremiumPage() {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.premium.getStatus.useQuery();
    const openOverlay = usePremiumOverlay((s) => s.openOverlay);
    const cancel = trpc.premium.cancel.useMutation({
        onSuccess: async () => {
            await utils.premium.getStatus.invalidate();
            appToast.success("Auto-renew turned off. Access lasts until the period ends.");
        },
        onError: (e) => appToast.error(e.message),
    });

    return (
        <div className="mx-auto w-full max-w-5xl px-5 pt-20 pb-20 md:px-8 md:pt-24">
            {isLoading ? (
                <Skeleton className="h-48 w-full rounded-3xl" />
            ) : data?.entitled && data.subscription ? (
                <ActiveState
                    sub={data.subscription}
                    onChange={() => openOverlay()}
                    onCancel={() => cancel.mutate(undefined)}
                    canceling={cancel.isPending}
                />
            ) : (
                <Hero onSeePlans={() => openOverlay()} />
            )}

            {/* Highlights — shown to everyone (a reminder of what's included). */}
            <section className="mt-14">
                <h2 className="mb-5 text-xl font-extrabold tracking-tight md:text-2xl">What you get</h2>
                <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-border sm:grid-cols-2 lg:grid-cols-3">
                    {HIGHLIGHTS.map((h) => (
                        <div key={h.title} className="flex gap-3 bg-card p-5">
                            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-twitter/10 text-twitter">
                                <h.icon className="size-5" strokeWidth={1.75} />
                            </span>
                            <div>
                                <p className="text-sm font-bold tracking-tight">{h.title}</p>
                                <p className="mt-0.5 text-sm text-muted-foreground">{h.body}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Individual plans — preview cards that open the overlay to subscribe. */}
            <section className="mt-14">
                <div className="mb-5 flex items-baseline justify-between">
                    <h2 className="text-xl font-extrabold tracking-tight md:text-2xl">Choose your plan</h2>
                    <button
                        onClick={() => openOverlay()}
                        className="text-sm font-semibold text-twitter hover:underline"
                    >
                        Compare all features
                    </button>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {INDIVIDUAL_TIERS.map((key) => (
                        <PlanCard key={key} tierKey={key} onChoose={() => openOverlay(key)} />
                    ))}
                </div>

                {/* Business teaser. */}
                <button
                    onClick={() => openOverlay("biz_pro")}
                    className="group mt-4 flex w-full items-center justify-between gap-4 rounded-2xl bg-card p-5 ring-1 ring-border transition-colors hover:bg-muted"
                >
                    <span className="text-left">
                        <span className="block text-sm font-bold tracking-tight">Running a team or brand?</span>
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                            Organization badges, affiliated accounts, team analytics and more.
                        </span>
                    </span>
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground/[0.06] text-muted-foreground ring-1 ring-border transition-all group-hover:bg-foreground group-hover:text-background">
                        <ArrowUpRight className="size-4" strokeWidth={1.75} />
                    </span>
                </button>

                <p className="mt-4 text-center text-xs text-muted-foreground">
                    Billed in USDC. Choose monthly or annual ({ANNUAL_MONTHS_FREE} months free) at checkout.
                </p>
            </section>
        </div>
    );
}

function Hero({ onSeePlans }: { onSeePlans: () => void }) {
    return (
        <section className="relative overflow-hidden rounded-3xl bg-card p-8 ring-1 ring-border md:p-12">
            <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-twitter/20 blur-3xl" />
            <div className="relative flex flex-col items-start">
                <span className="grid size-14 place-items-center rounded-2xl bg-twitter/10 text-twitter ring-1 ring-twitter/20">
                    <Sparkles className="size-7" strokeWidth={1.75} />
                </span>
                <h1 className="mt-5 max-w-xl text-3xl font-black tracking-tight md:text-5xl">
                    Get more out of Watchparty
                </h1>
                <p className="mt-3 max-w-md text-base text-muted-foreground">
                    Verified badges, creator payouts, analytics, higher limits and ad credits. One subscription, billed in USDC.
                </p>
                <div className="mt-6 flex flex-wrap gap-3">
                    <button
                        onClick={onSeePlans}
                        className="rounded-full bg-foreground px-6 py-3 text-sm font-bold text-background transition-opacity hover:opacity-90"
                    >
                        See all plans
                    </button>
                </div>
            </div>
        </section>
    );
}

function PlanCard({ tierKey, onChoose }: { tierKey: TierKey; onChoose: () => void }) {
    const t = TIERS[tierKey];
    const highlighted = !!t.highlighted;
    return (
        <div
            className={cn(
                "flex flex-col rounded-2xl bg-card p-6 ring-1 transition-colors",
                highlighted ? "ring-2 ring-twitter" : "ring-border"
            )}
        >
            <div className="flex items-center justify-between">
                <p className="text-lg font-extrabold tracking-tight">{t.name}</p>
                {highlighted && (
                    <span className="rounded-full bg-twitter/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-twitter">
                        Popular
                    </span>
                )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{t.tagline}</p>
            <p className="mt-4">
                <span className="text-3xl font-black tracking-tight">{formatUsd(priceUsd(tierKey, "monthly"))}</span>
                <span className="text-sm font-medium text-muted-foreground"> / month</span>
            </p>
            <ul className="mt-5 flex-1 space-y-2.5">
                {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                        <Check className="mt-0.5 size-4 shrink-0 text-twitter" strokeWidth={2.5} />
                        <span>{f}</span>
                    </li>
                ))}
            </ul>
            <button
                onClick={onChoose}
                className={cn(
                    "mt-6 rounded-full px-6 py-3 text-sm font-bold transition-opacity hover:opacity-90",
                    highlighted ? "bg-twitter text-white" : "bg-foreground text-background"
                )}
            >
                Get {t.name}
            </button>
        </div>
    );
}

function ActiveState({
    sub,
    onChange,
    onCancel,
    canceling,
}: {
    sub: {
        tierKey: string;
        billingCycle: string;
        status: string;
        currentPeriodEnd: string | Date;
        cancelAtPeriodEnd: boolean;
    };
    onChange: () => void;
    onCancel: () => void;
    canceling: boolean;
}) {
    const tier = TIERS[sub.tierKey as TierKey];
    return (
        <section className="relative overflow-hidden rounded-3xl bg-card p-8 ring-1 ring-border md:p-10">
            <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-twitter/20 blur-3xl" />
            <div className="relative">
                <div className="flex items-center gap-3">
                    <span className="grid size-12 place-items-center rounded-2xl bg-twitter/10 text-twitter ring-1 ring-twitter/20">
                        <Crown className="size-6" strokeWidth={1.75} />
                    </span>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your plan</p>
                        <h1 className="text-2xl font-black tracking-tight">{tier?.name ?? sub.tierKey}</h1>
                    </div>
                </div>

                <p className="mt-4 text-sm text-muted-foreground">
                    <span className="capitalize">{sub.billingCycle}</span> ·{" "}
                    <span className="capitalize">{sub.status.replace("_", " ")}</span> ·{" "}
                    {sub.cancelAtPeriodEnd ? "Ends" : "Renews"}{" "}
                    {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                    <button
                        onClick={onChange}
                        className="rounded-full bg-foreground px-5 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
                    >
                        Change plan
                    </button>
                    <a
                        href="https://ads.watchparty.xyz"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-full bg-foreground/[0.06] px-5 py-2.5 text-sm font-semibold ring-1 ring-border transition-colors hover:bg-muted"
                    >
                        <Megaphone className="size-4" strokeWidth={1.75} /> Manage ads
                    </a>
                    {!sub.cancelAtPeriodEnd && (
                        <button
                            onClick={onCancel}
                            disabled={canceling}
                            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-red-500 transition-colors hover:bg-red-500/10 disabled:opacity-50"
                        >
                            {canceling && <Loader2 className="size-4 animate-spin" />}
                            Cancel auto-renew
                        </button>
                    )}
                </div>

                {tier && (
                    <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                        <Wand2 className="size-4 text-twitter" strokeWidth={1.75} />
                        You have access to everything in {tier.name}.
                    </p>
                )}
            </div>
        </section>
    );
}
