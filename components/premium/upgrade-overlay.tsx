"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { Squircle } from "@/components/ui/squircle";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { usePremiumOverlay } from "@/lib/premium/overlay-store";
import { COMPARISON, type BillingCycle, type TierKey } from "@/lib/premium/tiers";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { appToast } from "@/components/app-ui/app-toast";
import { Check, X, Loader2, Crown, Building2, ChevronRight } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";

type PlansData = inferRouterOutputs<AppRouter>["premium"]["getPlans"];
type TierRow = PlansData["tiers"][number];

export function UpgradeOverlay() {
    const { open, initialTier, closeOverlay } = usePremiumOverlay();
    const { data } = trpc.premium.getPlans.useQuery(undefined, { staleTime: 5 * 60_000 });

    const [cycle, setCycle] = useState<BillingCycle>("monthly");
    const [view, setView] = useState<"individual" | "business">("individual");
    const [selected, setSelected] = useState<TierKey | null>(null);
    const [contactOpen, setContactOpen] = useState(false);

    // Land on the right view / preselection when opened.
    useEffect(() => {
        if (!open) return;
        const group = initialTier ? data?.tiers.find((t) => t.key === initialTier)?.group : undefined;
        setView(group === "business" ? "business" : "individual");
        setSelected(initialTier ?? null);
        setContactOpen(false);
    }, [open, initialTier, data]);

    const tiers = data?.tiers ?? [];
    const visible = useMemo(
        () => tiers.filter((t) => t.group === view),
        [tiers, view],
    );
    const selectedTier = tiers.find((t) => t.key === selected) ?? null;

    return (
        <Dialog open={open} onOpenChange={(o) => !o && closeOverlay()}>
            <DialogContent
                showCloseButton={false}
                className="max-w-5xl w-[calc(100vw-1.5rem)] sm:w-full h-[90vh] p-0 gap-0 overflow-hidden border-white/10 bg-zinc-950 sm:rounded-2xl"
            >
                <VisuallyHidden.Root>
                    <DialogTitle>Upgrade to Premium</DialogTitle>
                    <DialogDescription>Choose a premium plan</DialogDescription>
                </VisuallyHidden.Root>

                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="relative shrink-0 px-5 pt-5 pb-3 border-b border-white/10">
                        <button
                            onClick={closeOverlay}
                            aria-label="Close"
                            className="absolute left-4 top-4 grid place-items-center size-9 rounded-full text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
                        >
                            <X className="size-5" />
                        </button>
                        <h2 className="text-center text-xl sm:text-2xl font-bold text-white">
                            Upgrade to Premium
                        </h2>
                        <div className="mt-3 flex justify-center">
                            <CycleToggle cycle={cycle} onChange={setCycle} />
                        </div>
                    </div>

                    {/* Scroll body */}
                    <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
                        <div
                            className={cn(
                                "grid gap-3 mx-auto",
                                view === "individual" ? "max-w-2xl sm:grid-cols-2" : "max-w-4xl sm:grid-cols-3",
                            )}
                        >
                            {visible.map((tier) => (
                                <TierCard
                                    key={tier.key}
                                    tier={tier}
                                    cycle={cycle}
                                    selected={selected === tier.key}
                                    onSelect={() => {
                                        if (!tier.selfServe) {
                                            setContactOpen(true);
                                            return;
                                        }
                                        setSelected(tier.key);
                                    }}
                                />
                            ))}
                        </div>

                        {view === "individual" && (
                            <BusinessBanner onExplore={() => { setView("business"); setSelected(null); }} />
                        )}
                        {view === "business" && (
                            <button
                                onClick={() => { setView("individual"); setSelected(null); }}
                                className="mt-4 mx-auto block text-sm text-zinc-400 hover:text-white transition-colors"
                            >
                                ← Back to individual plans
                            </button>
                        )}

                        <CompareTable tiers={visible} />
                    </div>

                    {/* Sticky subscribe bar */}
                    <SubscribeBar
                        tier={selectedTier}
                        cycle={cycle}
                        onSubscribed={closeOverlay}
                    />
                </div>

                <ContactSalesDialog open={contactOpen} onOpenChange={setContactOpen} />
            </DialogContent>
        </Dialog>
    );
}

function CycleToggle({ cycle, onChange }: { cycle: BillingCycle; onChange: (c: BillingCycle) => void }) {
    return (
        <div className="inline-flex rounded-full border border-white/15 p-0.5 text-sm font-semibold">
            {(["monthly", "annual"] as const).map((c) => (
                <button
                    key={c}
                    onClick={() => onChange(c)}
                    className={cn(
                        "px-4 py-1.5 rounded-full transition-colors capitalize",
                        cycle === c ? "bg-white text-zinc-950" : "text-zinc-400 hover:text-white",
                    )}
                >
                    {c}
                    {c === "annual" && <span className="ml-1 text-xs opacity-70">2 mo free</span>}
                </button>
            ))}
        </div>
    );
}

function TierCard({
    tier,
    cycle,
    selected,
    onSelect,
}: {
    tier: TierRow;
    cycle: BillingCycle;
    selected: boolean;
    onSelect: () => void;
}) {
    const priceLabel = cycle === "annual" ? tier.annualLabel : tier.monthlyLabel;
    const period = tier.selfServe ? (cycle === "annual" ? "/year" : "/month") : "";
    return (
        <Squircle
            asChild
            radius={20}
            className={cn(
                "relative p-4 text-left transition-colors",
                selected ? "bg-twitter/15 ring-2 ring-twitter" : "bg-white/[0.04] ring-1 ring-white/10 hover:ring-white/20",
            )}
        >
            <button onClick={onSelect} className="block w-full">
                {tier.highlighted && (
                    <span className="absolute right-3 top-3 text-[10px] font-bold uppercase tracking-wide text-twitter">
                        Popular
                    </span>
                )}
                <div className="flex items-center gap-2">
                    {tier.group === "business" ? (
                        <Building2 className="size-4 text-zinc-300" />
                    ) : (
                        <Crown className="size-4 text-zinc-300" />
                    )}
                    <span className="font-bold text-white">{tier.name}</span>
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-white">{priceLabel}</span>
                    {period && <span className="text-sm text-zinc-400">{period}</span>}
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">{tier.tagline}</p>
                <ul className="mt-3 space-y-1.5">
                    {tier.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                            <Check className="mt-0.5 size-3.5 shrink-0 text-twitter" />
                            {f}
                        </li>
                    ))}
                </ul>
                {!tier.selfServe && (
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-twitter">
                        Contact sales <ChevronRight className="size-3.5" />
                    </span>
                )}
            </button>
        </Squircle>
    );
}

function BusinessBanner({ onExplore }: { onExplore: () => void }) {
    return (
        <Squircle asChild radius={16} className="mt-4 max-w-2xl mx-auto block bg-white/[0.04] ring-1 ring-white/10">
            <div className="flex items-center justify-between gap-3 p-4">
                <div>
                    <p className="font-semibold text-white">Are you a business?</p>
                    <p className="text-xs text-zinc-400">Gain credibility and grow faster with Premium Business.</p>
                </div>
                <button
                    onClick={onExplore}
                    className="shrink-0 rounded-full bg-white/10 hover:bg-white/20 px-4 h-control text-sm font-semibold text-white transition-colors"
                >
                    Explore Premium Business
                </button>
            </div>
        </Squircle>
    );
}

function cellNode(v: boolean | string | undefined) {
    if (v === true) return <Check className="mx-auto size-4 text-twitter" />;
    if (v === false || v === undefined) return <X className="mx-auto size-4 text-zinc-600" />;
    return <span className="text-xs text-zinc-300">{v}</span>;
}

function CompareTable({ tiers }: { tiers: TierRow[] }) {
    const cols = tiers;
    return (
        <div className="mt-8 max-w-4xl mx-auto">
            <h3 className="mb-3 text-sm font-bold text-white">Compare tiers & features</h3>
            <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                    <thead>
                        <tr className="border-b border-white/10">
                            <th className="py-2 text-left font-medium text-zinc-400" />
                            {cols.map((t) => (
                                <th key={t.key} className="py-2 px-2 text-center font-semibold text-white">
                                    {t.name}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {COMPARISON.map((group) => (
                            <FragmentGroup key={group.group} group={group} cols={cols} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function FragmentGroup({
    group,
    cols,
}: {
    group: (typeof COMPARISON)[number];
    cols: TierRow[];
}) {
    return (
        <>
            <tr>
                <td
                    colSpan={cols.length + 1}
                    className="pt-4 pb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-500"
                >
                    {group.group}
                </td>
            </tr>
            {group.rows.map((row) => (
                <tr key={row.label} className="border-b border-white/5">
                    <td className="py-2 text-left text-zinc-300">{row.label}</td>
                    {cols.map((t) => (
                        <td key={t.key} className="py-2 px-2 text-center">
                            {cellNode(row.values[t.key])}
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );
}

function SubscribeBar({
    tier,
    cycle,
    onSubscribed,
}: {
    tier: TierRow | null;
    cycle: BillingCycle;
    onSubscribed: () => void;
}) {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();
    const utils = trpc.useUtils();
    const record = trpc.premium.recordSubscription.useMutation();
    const [pending, setPending] = useState(false);

    const planRef = tier ? (cycle === "annual" ? tier.plans.annual : tier.plans.monthly) : null;
    const priceLabel = tier ? (cycle === "annual" ? tier.annualLabel : tier.monthlyLabel) : "";
    const canSubscribe = !!tier && tier.selfServe && !!planRef;

    const handleSubscribe = async () => {
        if (!tier || !planRef) return;
        if (!publicKey) {
            appToast.error("Connect your wallet to subscribe");
            return;
        }
        setPending(true);
        try {
            const { runPremiumCheckout } = await import("@/lib/chains/solana/subscriptions/checkout");
            const result = await runPremiumCheckout({
                userPublicKey: publicKey,
                connection,
                sendTransaction,
                plan: {
                    merchant: planRef.merchant,
                    planId: planRef.planId,
                    amountBaseUnits: planRef.amountBaseUnits,
                    periodHours: planRef.periodHours,
                    createdAt: planRef.createdAt,
                },
            });
            await record.mutateAsync({
                tierKey: tier.key,
                billingCycle: cycle,
                subscriberWallet: publicKey.toBase58(),
                planPda: planRef.planPda,
                subscriptionPda: result.subscriptionPda,
                subscriptionAuthorityPda: result.subscriptionAuthorityPda,
                delegatorAta: result.delegatorAta,
                subscribeTxSignature: result.subscribeSignature,
            });
            await utils.premium.getStatus.invalidate();
            appToast.success(`You're now on ${tier.name}!`);
            onSubscribed();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            appToast.error(
                /reject|denied|cancel/i.test(msg) ? "Subscription cancelled" : `Subscription failed: ${msg}`,
            );
        } finally {
            setPending(false);
        }
    };

    return (
        <div className="shrink-0 border-t border-white/10 bg-zinc-950/80 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">
                    {tier ? tier.name : "Select a plan"}
                </p>
                {tier && (
                    <p className="text-xs text-zinc-400">
                        {priceLabel}
                        {tier.selfServe ? (cycle === "annual" ? "/year, billed annually" : "/month, billed monthly") : ""}
                    </p>
                )}
            </div>
            <button
                disabled={!canSubscribe || pending}
                onClick={handleSubscribe}
                className="shrink-0 inline-flex items-center justify-center gap-2 rounded-full bg-white text-zinc-950 font-bold px-6 h-control hover:bg-zinc-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {pending && <Loader2 className="size-4 animate-spin" />}
                Subscribe & Pay
            </button>
        </div>
    );
}

function ContactSalesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const contact = trpc.premium.contactSales.useMutation();
    const [form, setForm] = useState({ name: "", email: "", orgName: "", message: "" });

    const submit = async () => {
        if (!form.name || !form.email) {
            appToast.error("Name and email are required");
            return;
        }
        try {
            await contact.mutateAsync(form);
            appToast.success("Thanks — our team will reach out shortly.");
            onOpenChange(false);
            setForm({ name: "", email: "", orgName: "", message: "" });
        } catch (e) {
            appToast.error(e instanceof Error ? e.message : "Failed to submit");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md bg-zinc-950 border-white/10">
                <DialogTitle className="text-white">Contact sales — Enterprise</DialogTitle>
                <DialogDescription className="text-zinc-400">
                    Tell us about your organization and we&apos;ll get in touch.
                </DialogDescription>
                <div className="space-y-3 mt-2">
                    {([
                        ["name", "Your name"],
                        ["email", "Work email"],
                        ["orgName", "Organization (optional)"],
                    ] as const).map(([key, ph]) => (
                        <input
                            key={key}
                            value={form[key]}
                            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                            placeholder={ph}
                            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 h-control text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-twitter"
                        />
                    ))}
                    <textarea
                        value={form.message}
                        onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                        placeholder="What are you looking for?"
                        rows={3}
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-twitter resize-none"
                    />
                    <button
                        disabled={contact.isPending}
                        onClick={submit}
                        className="w-full rounded-full bg-white text-zinc-950 font-bold h-control hover:bg-zinc-200 transition-colors disabled:opacity-50"
                    >
                        {contact.isPending ? "Sending…" : "Request a call"}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
