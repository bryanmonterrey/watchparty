"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Crown, Check, ChevronDown, Gift } from "lucide-react";
import { toast } from "sonner";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { cn } from "@/lib/utils";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";

const USDC = 1_000_000; // 6 decimals
function baseToUsd(n: number) {
    return (n / USDC).toFixed(2).replace(/\.00$/, "");
}
const PERIOD_HOURS = { monthly: 30 * 24, annual: 365 * 24 } as const;
const TREASURY = process.env.NEXT_PUBLIC_PREMIUM_MERCHANT_PUBKEY ?? process.env.NEXT_PUBLIC_TREASURY_PUBKEY ?? "";

type Tier = inferRouterOutputs<AppRouter>["subscription"]["getTiers"][number];

interface SubscribeButtonProps {
    creatorId: string;
    /** Restyle the trigger — the watch header runs a different button skin. */
    className?: string;
    /** Trigger icon override. Pass null for a text-only trigger — the watch
     *  header's follow mark is its own button now, so Subscribe carries none. */
    icon?: React.ReactNode | null;
    creatorName: string;
}

export function SubscribeButton({ creatorId, creatorName, className, icon }: SubscribeButtonProps) {
    const { data: session } = useAuthSession();
    const utils = trpc.useUtils();
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();

    const { data: tiers } = trpc.subscription.getTiers.useQuery({ creatorId });
    const { data: subStatus, isLoading: subLoading } = trpc.subscription.isSubscribed.useQuery(
        { creatorId },
        { enabled: !!session?.user }
    );

    const record = trpc.subscription.recordCreatorSubscription.useMutation();
    const cancel = trpc.subscription.cancelSubscription.useMutation({
        onSuccess: () => {
            utils.subscription.isSubscribed.invalidate({ creatorId });
            toast.success("Subscription cancelled");
        },
    });

    const [showPicker, setShowPicker] = useState(false);
    const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
    const [pendingTier, setPendingTier] = useState<string | null>(null);

    const handleSubscribe = async (tier: Tier) => {
        const annual = billingCycle === "annual";
        const planId = annual ? tier.planIdAnnual : tier.planIdMonthly;
        const amount = annual ? tier.priceUsdcAnnual : tier.priceUsdcMonthly;
        const createdAt = annual ? tier.createdAtChainAnnual : tier.createdAtChainMonthly;
        if (!planId || !amount) { toast.error("This tier isn't available for that billing cycle"); return; }
        if (!publicKey) { toast.error("Connect your wallet to subscribe"); return; }
        if (!TREASURY) { toast.error("Subscriptions are not configured"); return; }

        setPendingTier(tier.id);
        try {
            const { runPremiumCheckout } = await import("@/lib/chains/solana/subscriptions/checkout");
            const result = await runPremiumCheckout({
                userPublicKey: publicKey,
                connection,
                sendTransaction,
                plan: {
                    merchant: TREASURY,
                    planId,
                    amountBaseUnits: String(amount),
                    periodHours: annual ? PERIOD_HOURS.annual : PERIOD_HOURS.monthly,
                    createdAt: String(createdAt ?? 0),
                },
            });
            const res = await record.mutateAsync({
                tierId: tier.id,
                billingCycle,
                subscriberWallet: publicKey.toBase58(),
                planPda: result.subscriptionAuthorityPda ? (annual ? tier.planPdaAnnual : tier.planPdaMonthly) ?? "" : "",
                subscriptionPda: result.subscriptionPda,
                subscriptionAuthorityPda: result.subscriptionAuthorityPda,
                delegatorAta: result.delegatorAta,
                subscribeTxSignature: result.subscribeSignature,
            });
            utils.subscription.isSubscribed.invalidate({ creatorId });
            if (res.charged) {
                setShowPicker(false);
                toast.success(`Subscribed to ${creatorName}!`);
            } else {
                toast.error("Subscription authorized, but the first USDC payment couldn't be collected. Top up USDC — we'll retry shortly.");
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            toast.error(/reject|denied|cancel/i.test(msg) ? "Subscription cancelled" : `Subscription failed: ${msg}`);
        } finally {
            setPendingTier(null);
        }
    };

    if (!tiers?.length) return null;
    if (!session?.user) return null;

    if (subStatus?.subscribed) {
        return (
            <div className="relative">
                <button
                    onClick={() => setShowPicker(p => !p)}
                    className="flex h-11 items-center gap-1.5 px-4 rounded-full bg-hotpink/10 border border-hotpink/30 text-hotpink text-sm font-semibold hover:bg-hotpink/20 transition-colors"
                >
                    <Crown className="w-4 h-4" />
                    {subStatus.tier?.name ?? "Subscribed"}
                    <ChevronDown className="w-3 h-3" />
                </button>
                {showPicker && (
                    <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-white/10 rounded-xl shadow-xl z-20 w-52 py-1 overflow-hidden"
                        onClick={e => e.stopPropagation()}>
                        <button
                            onClick={() => cancel.mutate({ creatorId })}
                            className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-red-400 hover:bg-white/5 transition-colors text-left"
                        >
                            Cancel subscription
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="relative">
            <button
                onClick={() => setShowPicker(p => !p)}
                className={className ?? "flex h-11 items-center gap-1.5 px-4 rounded-full bg-hotpink text-white text-sm font-bold hover:bg-hotpink/90 transition-colors"}
            >
                {/* `icon` may be null to mean NO icon — hence the undefined
                    check rather than ??, which would fall back to the crown. */}
                {icon !== undefined ? icon : <Crown className="w-4 h-4" />}
                Subscribe
            </button>
            {showPicker && (
                <div className="absolute right-0 top-full mt-1 bg-zinc-900 border border-white/10 rounded-xl shadow-xl z-20 w-64 overflow-hidden"
                    onClick={e => e.stopPropagation()}>
                    <div className="p-3 border-b border-white/10">
                        <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs font-semibold">
                            <button onClick={() => setBillingCycle("monthly")}
                                className={cn("flex-1 py-1.5 transition-colors", billingCycle === "monthly" ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}>
                                Monthly
                            </button>
                            <button onClick={() => setBillingCycle("annual")}
                                className={cn("flex-1 py-1.5 transition-colors", billingCycle === "annual" ? "bg-white/10 text-zinc-100" : "text-zinc-500 hover:text-zinc-300")}>
                                Annual
                            </button>
                        </div>
                    </div>
                    <div className="p-2 space-y-1">
                        {tiers.map(tier => {
                            const annual = billingCycle === "annual";
                            const price = annual ? tier.priceUsdcAnnual : tier.priceUsdcMonthly;
                            if (!price) return null;
                            return (
                                <button
                                    key={tier.id}
                                    onClick={() => handleSubscribe(tier)}
                                    disabled={pendingTier !== null}
                                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left disabled:opacity-50"
                                >
                                    <div>
                                        <p className="text-sm font-semibold text-zinc-100">{tier.name}</p>
                                        {tier.description && <p className="text-xs text-zinc-500 truncate max-w-[140px]">{tier.description}</p>}
                                    </div>
                                    <span className="text-xs font-bold text-hotpink shrink-0 ml-2">
                                        {pendingTier === tier.id ? "…" : `$${baseToUsd(price)}/${annual ? "yr" : "mo"}`}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
