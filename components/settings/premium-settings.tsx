"use client";

import { trpc } from "@/lib/trpc/client";
import { usePremiumOverlay } from "@/lib/premium/overlay-store";
import { TIERS, type TierKey } from "@/lib/premium/tiers";
import { Crown, Loader2, Megaphone, ArrowUpRight } from "lucide-react";
import { appToast } from "@/components/app-ui/app-toast";
import { Skeleton } from "@/components/ui/skeleton";

export function PremiumSettings() {
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

    if (isLoading) return <Skeleton className="h-40 rounded-xl" />;

    const sub = data?.subscription;
    const active = data?.entitled && sub;

    if (!active) {
        return (
            <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-6 text-center">
                <Crown className="mx-auto size-8 text-twitter" />
                <p className="mt-3 font-semibold text-zinc-100">You&apos;re not on Premium</p>
                <p className="mt-1 text-sm text-zinc-400">
                    Unlock verified badges, higher limits, analytics and more.
                </p>
                <button
                    onClick={() => openOverlay()}
                    className="mt-4 rounded-full bg-white text-zinc-950 font-bold px-6 h-11 hover:bg-zinc-200 transition-colors"
                >
                    Upgrade to Premium
                </button>
            </div>
        );
    }

    const tier = TIERS[sub.tierKey as TierKey];
    return (
        <div className="space-y-4">
            <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-5">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Crown className="size-5 text-twitter" />
                        <div>
                            <p className="font-bold text-zinc-100">{tier?.name ?? sub.tierKey}</p>
                            <p className="text-xs text-zinc-400 capitalize">
                                {sub.billingCycle} · {sub.status.replace("_", " ")}
                            </p>
                        </div>
                    </div>
                    <span className="text-xs text-zinc-500">
                        {sub.cancelAtPeriodEnd ? "Ends" : "Renews"}{" "}
                        {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                    </span>
                </div>

                <div className="mt-4 flex gap-2">
                    <button
                        onClick={() => openOverlay()}
                        className="rounded-full bg-white/10 hover:bg-white/20 text-zinc-100 font-semibold px-4 h-11 text-sm transition-colors"
                    >
                        Change plan
                    </button>
                    {!sub.cancelAtPeriodEnd && (
                        <button
                            onClick={() => cancel.mutate(undefined)}
                            disabled={cancel.isPending}
                            className="flex items-center gap-2 rounded-full bg-transparent hover:bg-red-500/10 text-red-400 font-semibold px-4 h-11 text-sm transition-colors disabled:opacity-50"
                        >
                            {cancel.isPending && <Loader2 className="size-4 animate-spin" />}
                            Cancel auto-renew
                        </button>
                    )}
                </div>
            </div>

            {/* Premium features you can manage. Ads opens the ad dashboard, where
                you create campaigns funded by ad credits — your plan includes a
                monthly allowance, and you can buy more there. */}
            {/* Ads — a manageable premium feature. Double-bezel: outer shell (tray)
                holds an inner core (plate). Opens the ad dashboard, where campaigns
                are funded by ad credits (plan includes a monthly allowance). */}
            <a
                href="https://ads.watchparty.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-[1.75rem] bg-white/[0.03] p-1.5 ring-1 ring-white/10 transition-transform duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99]"
            >
                <div className="relative flex items-center justify-between gap-4 overflow-hidden rounded-[calc(1.75rem-0.375rem)] bg-gradient-to-b from-zinc-900 to-zinc-950 p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)]">
                    {/* ambient glow */}
                    <div className="pointer-events-none absolute -right-12 -top-16 size-40 rounded-full bg-twitter/20 blur-3xl transition-opacity duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] opacity-60 group-hover:opacity-100" />
                    <div className="relative flex items-center gap-4">
                        <div className="grid size-11 place-items-center rounded-2xl bg-white/[0.04] text-twitter ring-1 ring-white/10 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                            <Megaphone className="size-5" strokeWidth={1.5} />
                        </div>
                        <div>
                            <p className="text-[15px] font-semibold tracking-tight text-white">Ads</p>
                            <p className="mt-0.5 text-xs text-zinc-400">
                                {(tier?.adCreditsMonthly ?? 0) > 0
                                    ? `Includes $${tier!.adCreditsMonthly}/mo in ad credits · manage campaigns`
                                    : "Create & manage ad campaigns"}
                            </p>
                        </div>
                    </div>
                    {/* button-in-button trailing arrow */}
                    <div className="relative grid size-9 shrink-0 place-items-center rounded-full bg-white/[0.06] text-zinc-300 ring-1 ring-white/10 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:bg-white group-hover:text-black group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
                        <ArrowUpRight className="size-4" strokeWidth={1.75} />
                    </div>
                </div>
            </a>
        </div>
    );
}
