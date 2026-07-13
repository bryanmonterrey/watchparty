"use client";

import { trpc } from "@/lib/trpc/client";
import { usePremiumOverlay } from "@/lib/premium/overlay-store";
import { TIERS, type TierKey } from "@/lib/premium/tiers";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowUpRight01Icon, CrownIcon, Loading03Icon, Megaphone02Icon } from "@hugeicons/core-free-icons";
import { appToast } from "@/components/app-ui/app-toast";
import { Panel, PillButton } from "@/components/settings/ui";

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

    if (isLoading) return (
        <div className="h-40 overflow-hidden rounded-[24px]"><div className="size-full shimmer-skeleton" /></div>
    );

    const sub = data?.subscription;
    const active = data?.entitled && sub;

    if (!active) {
        return (
            <Panel className="p-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
                <HugeiconsIcon icon={CrownIcon} className="mx-auto size-8 text-twitter" strokeWidth={2} />
                <p className="mt-3 text-[15px] font-bold tracking-tight text-white">You&apos;re not on Premium</p>
                <p className="mt-1 text-[13px] font-medium text-zinc-400">
                    Unlock verified badges, higher limits, analytics and more.
                </p>
                <PillButton variant="primary" className="mt-4 px-6" onClick={() => openOverlay()}>
                    Upgrade to Premium
                </PillButton>
            </Panel>
        );
    }

    const tier = TIERS[sub.tierKey as TierKey];
    return (
        <div className="space-y-4">
            <Panel className="p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <HugeiconsIcon icon={CrownIcon} className="size-5 text-twitter" strokeWidth={2} />
                        <div>
                            <p className="text-[15px] font-bold tracking-tight text-white">{tier?.name ?? sub.tierKey}</p>
                            <p className="text-[12px] font-medium capitalize text-zinc-500">
                                {sub.billingCycle} · {sub.status.replace("_", " ")}
                            </p>
                        </div>
                    </div>
                    <span className="text-[12px] font-medium text-zinc-500">
                        {sub.cancelAtPeriodEnd ? "Ends" : "Renews"}{" "}
                        {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                    </span>
                </div>

                <div className="mt-4 flex gap-2">
                    <PillButton className="" onClick={() => openOverlay()}>
                        Change plan
                    </PillButton>
                    {!sub.cancelAtPeriodEnd && (
                        <button
                            onClick={() => cancel.mutate(undefined)}
                            disabled={cancel.isPending}
                            className="flex h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-pastelred transition-colors hover:bg-pastelred/10 disabled:opacity-50"
                        >
                            {cancel.isPending && <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" strokeWidth={2} />}
                            Cancel auto-renew
                        </button>
                    )}
                </div>
            </Panel>

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
                            <HugeiconsIcon icon={Megaphone02Icon} className="size-5" strokeWidth={1.5} />
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
                        <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-4" strokeWidth={1.75} />
                    </div>
                </div>
            </a>
        </div>
    );
}
