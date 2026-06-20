"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc/client";
import { usePremiumOverlay } from "@/lib/premium/overlay-store";
import { COMPARISON, type BillingCycle, type TierKey } from "@/lib/premium/tiers";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { appToast } from "@/components/app-ui/app-toast";
import { 
    Check, X, Loader2, ChevronRight, Zap, Bookmark, Star, 
    Pencil, FileText, SlidersHorizontal, Sparkles, TrendingUp, 
    EyeOff, DollarSign, Store, Search, LayoutGrid, Briefcase
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { ArrowLeftIcon } from "@/components/icons";

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

    // Close on Escape + lock body scroll while the full-page overlay is open
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeOverlay(); };
        window.addEventListener("keydown", onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [open, closeOverlay]);

    const tiers = data?.tiers ?? [];
    const visible = useMemo(
        () => tiers.filter((t) => t.group === view),
        [tiers, view],
    );
    const selectedTier = tiers.find((t) => t.key === selected) ?? null;

    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Upgrade to Premium"
            className="fixed inset-0 z-50 flex flex-col bg-black text-white font-sans"
        >
                    {/* Floating Close button */}
                    <button
                        onClick={closeOverlay}
                        aria-label="Close"
                        className="absolute left-6 top-6 z-10 grid place-items-center size-9 rounded-full bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800/40 text-zinc-400 hover:text-white transition-all duration-200 cursor-pointer"
                    >
                        <X className="size-5" />
                    </button>

                    {/* Scroll body */}
                    <div className="flex-1 overflow-y-auto px-4 sm:px-8 pb-12">
                        {/* Header illustration, title, cycle toggle */}
                        <div className="pt-16 pb-6 flex flex-col items-center justify-center shrink-0">
                            {/* Verification Sparkle Checkmark Badge */}
                            <div className="flex justify-center mb-4">
                                <div className="relative flex items-center justify-center w-16 h-16">
                                    <svg className="absolute w-24 h-24 text-sky-500/80 animate-pulse" viewBox="0 0 100 100" fill="none">
                                        <circle cx="50" cy="18" r="2" fill="currentColor" />
                                        <circle cx="22" cy="45" r="1.5" fill="currentColor" />
                                        <circle cx="80" cy="50" r="1.5" fill="currentColor" />
                                        <circle cx="35" cy="80" r="2.5" fill="currentColor" className="opacity-60" />
                                        <circle cx="68" cy="82" r="1.8" fill="currentColor" />
                                        <path d="M 45,26 L 39,32" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 3" />
                                        <path d="M 55,26 L 61,32" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 3" />
                                    </svg>
                                    <svg className="w-12 h-12 text-sky-500 drop-shadow-[0_0_8px_rgba(14,165,233,0.3)]" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.15-.4.218-.84.218-1.28 0-2.205-1.795-4-4-4-.44 0-.88.068-1.28.218C14.787 2.625 13.418 1.75 12 1.75c-1.417 0-2.787.875-3.434 2.15-.4-.15-.84-.218-1.28-.218-2.205 0-4 1.795-4 4 0 .44.068.88.218 1.28C2.25 9.55 1.375 10.92 1.375 12.5c0 1.58.875 2.95 2.148 3.6-.15.4-.218.84-.218 1.28 0 2.205 1.795 4 4 4 .44 0 .88-.068-1.28-.218C9.213 22.375 10.582 23.25 12 23.25c1.417 0 2.787-.875 3.434-2.15.4.15.84.218-1.28.218C9.213 22.375 10.582 23.25 12 23.25c1.417 0 2.787-.875 3.434-2.15.4.15.84.218 1.28.218 2.205 0 4-1.795 4-4 0-.44-.068-.88-.218-1.28 1.273-.65 2.148-2.02 2.148-3.6zm-12.72 3.11l-3.24-3.24 1.06-1.06 2.18 2.18 5.66-5.66 1.06 1.06-6.72 6.72z" />
                                    </svg>
                                </div>
                            </div>

                            <h2 className="text-center text-3xl font-black text-white tracking-tight sm:text-4xl">
                                Upgrade to Premium
                            </h2>
                            <div className="mt-5 flex justify-center">
                                <CycleToggle cycle={cycle} onChange={setCycle} />
                            </div>
                        </div>

                        <div className="mx-auto w-full max-w-5xl space-y-6">
                            <div
                                className={cn(
                                    "grid gap-4 grid-cols-1",
                                    visible.length === 2 ? "md:grid-cols-2 max-w-3xl mx-auto" : "md:grid-cols-3",
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
                                    className="mt-2 flex flex-row items-center gap-2 mx-auto block text-sm font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer"
                                >
                                    <ArrowLeftIcon className="size-4" /> Back to individual plans
                                </button>
                            )}

                            <CompareTable tiers={visible} />
                        </div>
                    </div>

                    {/* Sticky subscribe bar */}
                    <SubscribeBar
                        tier={selectedTier}
                        cycle={cycle}
                        onSubscribed={closeOverlay}
                    />

                    <ContactSalesDialog open={contactOpen} onOpenChange={setContactOpen} />
                </div>
    );
}

function CycleToggle({ cycle, onChange }: { cycle: BillingCycle; onChange: (c: BillingCycle) => void }) {
    return (
        <div className="relative inline-flex rounded-full bg-[#16181c] p-1 text-sm font-semibold shadow-inner">
            {(["monthly", "annual"] as const).map((c) => {
                const active = cycle === c;
                return (
                    <button
                        key={c}
                        onClick={() => onChange(c)}
                        className={cn(
                            "relative z-10 px-5 py-3 rounded-full capitalize text-xs sm:text-sm font-bold transition-colors duration-200 select-none cursor-pointer focus:outline-none min-w-[90px] sm:min-w-[110px]",
                            active ? "text-black" : "text-zinc-400 hover:text-white",
                        )}
                    >
                        {c}
                        {active && (
                            <motion.div
                                layoutId="cycle-toggle-bg"
                                className="absolute inset-0 bg-white rounded-full -z-10"
                                transition={{ type: "spring", stiffness: 380, damping: 30 }}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}function getFeatureIcon(f: string) {
    const name = f.toLowerCase();
    if (name.includes("reply boost") || name.includes("boosted replies")) {
        return <Zap className="size-4 text-zinc-200 shrink-0 mt-0.5" />;
    }
    if (name.includes("bookmark")) {
        return <Bookmark className="size-4 text-zinc-200 shrink-0 mt-0.5" />;
    }
    if (name.includes("highlights")) {
        return <Star className="size-4 text-zinc-200 shrink-0 mt-0.5" />;
    }
    if (name.includes("edit")) {
        return <Pencil className="size-4 text-zinc-200 shrink-0 mt-0.5" />;
    }
    if (name.includes("longer posts") || name.includes("write articles") || name.includes("create longer")) {
        return <FileText className="size-4 text-zinc-200 shrink-0 mt-0.5" />;
    }
    if (name.includes("customize")) {
        return <SlidersHorizontal className="size-4 text-zinc-200 shrink-0 mt-0.5" />;
    }
    if (name.includes("checkmark") || name.includes("verified")) {
        return (
            <svg className="size-4 text-[#1d9bf0] shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.15-.4.218-.84.218-1.28 0-2.205-1.795-4-4-4-.44 0-.88.068-1.28.218C14.787 2.625 13.418 1.75 12 1.75c-1.417 0-2.787.875-3.434 2.15-.4-.15-.84-.218-1.28-.218-2.205 0-4 1.795-4 4 0 .44.068.88.218 1.28C2.25 9.55 1.375 10.92 1.375 12.5c0 1.58.875 2.95 2.148 3.6-.15.4-.218.84-.218 1.28 0 2.205 1.795 4 4 4 .44 0 .88-.068-1.28-.218C9.213 22.375 10.582 23.25 12 23.25c1.417 0 2.787-.875 3.434-2.15.4.15.84.218 1.28.218 2.205 0 4-1.795 4-4 0-.44-.068-.88-.218-1.28 1.273-.65 2.148-2.02 2.148-3.6zm-12.72 3.11l-3.24-3.24 1.06-1.06 2.18 2.18 5.66-5.66 1.06 1.06-6.72 6.72z" />
            </svg>
        );
    }
    if (name.includes("grok") || name.includes("supergrok")) {
        return <Sparkles className="size-4 text-purple-400 shrink-0 mt-0.5" />;
    }
    if (name.includes("analytics")) {
        return <TrendingUp className="size-4 text-zinc-200 shrink-0 mt-0.5" />;
    }
    if (name.includes("ads") || name.includes("ad-free")) {
        return <EyeOff className="size-4 text-zinc-200 shrink-0 mt-0.5" />;
    }
    if (name.includes("paid") || name.includes("creator subscriptions")) {
        return <DollarSign className="size-4 text-zinc-200 shrink-0 mt-0.5" />;
    }
    if (name.includes("marketplace")) {
        return <Store className="size-4 text-zinc-200 shrink-0 mt-0.5" />;
    }
    if (name.includes("radar")) {
        return <Search className="size-4 text-zinc-200 shrink-0 mt-0.5" />;
    }
    if (name.includes("pro")) {
        return <LayoutGrid className="size-4 text-zinc-200 shrink-0 mt-0.5" />;
    }
    if (name.includes("everything in")) {
        return <Check className="size-4 text-[#1d9bf0] shrink-0 mt-0.5" />;
    }
    return <Check className="size-4 text-zinc-200 shrink-0 mt-0.5" />;
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
    const isPremium = tier.key === "premium";
    return (
        <div
            onClick={onSelect}
            className={cn(
                "relative p-6 text-left transition-all duration-300 flex flex-col justify-between min-h-[380px] rounded-[20px] w-full cursor-pointer select-none border",
                selected
                    ? "bg-[#16181c] border-[#1d9bf0] ring-1 ring-[#1d9bf0]/20 shadow-[0_0_24px_rgba(29,155,240,0.18)]"
                    : isPremium
                    ? "bg-[#16181c] border-[#1d9bf0]/60 shadow-[0_0_15px_rgba(29,155,240,0.08)] hover:border-[#1d9bf0]"
                    : "bg-[#16181c] border-zinc-800/80 hover:border-zinc-700",
            )}
        >
            <div className="flex flex-col h-full w-full justify-between">
                <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">{tier.name}</h3>
                    <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-[32px] sm:text-[38px] font-black tracking-tight text-white">{priceLabel}</span>
                        {period && <span className="text-sm text-zinc-400 font-medium">{period}</span>}
                    </div>
                    {cycle === "annual" && tier.selfServe && (
                        <p className="mt-1 text-[10px] text-[#1d9bf0] font-bold">
                            Billed annually
                        </p>
                    )}
                    <ul className="mt-6 space-y-3.5">
                        {tier.features.map((f) => (
                            <li key={f} className="flex items-start gap-3 text-[14px] leading-snug text-zinc-100 font-medium">
                                {getFeatureIcon(f)}
                                <span className="text-left">{f}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                {!tier.selfServe && (
                    <div className="mt-4 flex items-center gap-1 text-xs font-bold text-[#1d9bf0]">
                        Contact sales <ChevronRight className="size-3" />
                    </div>
                )}
            </div>
        </div>
    );
}function BusinessBanner({ onExplore }: { onExplore: () => void }) {
    return (
        <div className="mt-2 block bg-[#16181c] border border-zinc-800/80 rounded-2xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 sm:px-6">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center size-10 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 shrink-0">
                        <svg className="size-5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.15-.4.218-.84.218-1.28 0-2.205-1.795-4-4-4-.44 0-.88.068-1.28.218C14.787 2.625 13.418 1.75 12 1.75c-1.417 0-2.787.875-3.434 2.15-.4-.15-.84-.218-1.28-.218-2.205 0-4 1.795-4 4 0 .44.068.88.218 1.28C2.25 9.55 1.375 10.92 1.375 12.5c0 1.58.875 2.95 2.148 3.6-.15.4-.218.84-.218 1.28 0 2.205 1.795 4 4 4 .44 0 .88-.068-1.28-.218C9.213 22.375 10.582 23.25 12 23.25c1.417 0 2.787-.875 3.434-2.15.4.15.84.218 1.28.218 2.205 0 4-1.795 4-4 0-.44-.068-.88-.218-1.28 1.273-.65 2.148-2.02 2.148-3.6zm-12.72 3.11l-3.24-3.24 1.06-1.06 2.18 2.18 5.66-5.66 1.06 1.06-6.72 6.72z" />
                        </svg>
                    </div>
                    <div>
                        <p className="text-[14px] font-extrabold text-white">Are you a business?</p>
                        <p className="text-xs text-zinc-400">Gain credibility and grow faster with Premium Business</p>
                    </div>
                </div>
                <button
                    onClick={onExplore}
                    className="w-full sm:w-auto shrink-0 rounded-full bg-[#2f3336] hover:bg-zinc-800 px-5 h-11 text-xs font-black text-white transition-colors cursor-pointer select-none"
                >
                    Explore Premium Business
                </button>
            </div>
        </div>
    );
}

function cellNode(v: boolean | string | undefined) {
    if (v === true) return <Check className="mx-auto size-4 text-white" />;
    if (v === false || v === undefined) return <span className="text-zinc-600 font-bold text-center block w-full text-xs">✕</span>;
    return <span className="text-xs text-zinc-300 font-semibold text-center block w-full">{v}</span>;
}

function CompareTable({ tiers }: { tiers: TierRow[] }) {
    const cols = tiers;
    const gridCols = { gridTemplateColumns: `minmax(0,1.8fr) repeat(${cols.length}, minmax(0,1.2fr))` };
    return (
        <div className="mt-8">
            <h3 className="mb-4 text-lg font-black text-white">Compare tiers &amp; features</h3>
            <div className="space-y-4">
                {COMPARISON.map((group) => (
                    <div
                        key={group.group}
                        className="block bg-[#16181c] border border-zinc-800/80 rounded-2xl overflow-hidden"
                    >
                        <div className="px-4 sm:px-6 py-2">
                            {/* group header + tier column labels */}
                            <div
                                className="grid items-center gap-2 py-3 border-b border-zinc-800"
                                style={gridCols}
                            >
                                <span className="text-[14px] font-extrabold text-white">{group.group}</span>
                                {cols.map((t) => (
                                    <span key={t.key} className="text-center text-sm font-bold text-white">
                                        {t.name}
                                    </span>
                                ))}
                            </div>
                            {group.rows.map((row) => (
                                <div
                                    key={row.label}
                                    className="grid items-center gap-2 py-3 border-b border-[#2f3336]/40 last:border-0"
                                    style={gridCols}
                                >
                                    <span className="text-[13px] text-zinc-300 font-medium">{row.label}</span>
                                    {cols.map((t) => (
                                        <div key={t.key} className="text-center">
                                            {cellNode(row.values[t.key])}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
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

    const period = tier?.selfServe ? (cycle === "annual" ? "/year" : "/month") : "";
    const billing = tier?.selfServe ? (cycle === "annual" ? "Billed annually" : "Billed monthly") : "";

    return (
        <div className="shrink-0 border-t border-zinc-800 bg-black/95 backdrop-blur-md px-6 sm:px-10 py-5">
            <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 sm:gap-8">
                {/* Left: stacked price block */}
                <div className="w-full sm:w-auto text-left flex flex-col justify-start">
                    {tier ? (
                        <>
                            <p className="text-[20px] font-bold text-white tracking-tight leading-snug">
                                {tier.name}
                            </p>
                            <div className="flex items-baseline gap-1 mt-0.5">
                                <span className="text-[28px] font-black text-white leading-none">{priceLabel}</span>
                                {period && <span className="text-sm text-zinc-400 font-medium">{period}</span>}
                            </div>
                            <p className="mt-1 text-[11px] text-[#71767b] font-medium leading-none">{billing}</p>
                        </>
                    ) : (
                        <p className="text-[20px] font-bold text-white tracking-tight">Select a plan</p>
                    )}
                </div>

                {/* Right: button + legal box block */}
                <div className="flex w-full sm:w-[55%] max-w-[450px] flex-col items-stretch gap-2.5">
                    <button
                        disabled={!canSubscribe || pending}
                        onClick={handleSubscribe}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white text-black text-xl font-bold h-16 hover:bg-zinc-200 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed select-none cursor-pointer"
                    >
                        {pending && <Loader2 className="size-4 animate-spin text-black" />}
                        Subscribe &amp; Pay
                    </button>
                    <div className="border border-zinc-800/80 rounded-xl p-3 bg-zinc-950/40 w-full">
                        <p className="text-[10px] leading-relaxed text-zinc-400">
                            By subscribing, you agree to our <span className="underline text-sky-500 cursor-pointer hover:text-sky-400">Purchaser Terms</span>, and that subscriptions auto-renew until you cancel. <span className="underline text-sky-500 cursor-pointer hover:text-sky-400">Cancel anytime</span>, at least 24 hours prior to renewal to avoid additional charges. Price subject to change. Manage your subscription through the platform you subscribed on.
                        </p>
                    </div>
                </div>
            </div>
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
                            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 h-11 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-twitter"
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
                        className="w-full rounded-full bg-white text-zinc-950 font-bold h-11 hover:bg-zinc-200 transition-colors disabled:opacity-50"
                    >
                        {contact.isPending ? "Sending…" : "Request a call"}
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
