"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, TrendingUp, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const SOL = 1_000_000_000;
function lamportsToSol(l: number) {
    return (l / SOL).toFixed(4);
}
function solToLamports(s: string) {
    return Math.round(parseFloat(s) * SOL);
}

const STATUS_CONFIG = {
    pending:    { icon: <Clock className="w-3.5 h-3.5" />,       color: "text-yellow-400",  label: "Pending" },
    processing: { icon: <Clock className="w-3.5 h-3.5" />,       color: "text-blue-400",    label: "Processing" },
    completed:  { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "text-white",    label: "Completed" },
    failed:     { icon: <AlertCircle className="w-3.5 h-3.5" />, color: "text-red-400",     label: "Failed" },
};

export function PayoutSettings() {
    const utils = trpc.useUtils();
    const { data: earnings, isLoading: earningsLoading } = trpc.subscription.getEarnings.useQuery();
    const { data: payoutHistory, isLoading: payoutsLoading } = trpc.subscription.getPayouts.useQuery();

    const requestPayout = trpc.subscription.requestPayout.useMutation({
        onSuccess: () => { utils.subscription.getPayouts.invalidate(); setAmount(""); toast.success("Payout requested"); },
        onError: e => toast.error(e.message),
    });

    // USDC subscription earnings (claim model: net = gross − 5% fee, no minimum).
    const { data: claimable } = trpc.subscription.getClaimable.useQuery();
    const claim = trpc.subscription.claimEarnings.useMutation({
        onSuccess: (r) => {
            utils.subscription.getClaimable.invalidate();
            utils.subscription.getPayouts.invalidate();
            toast.success(`Claimed $${(r.netUsdc / 1_000_000).toFixed(2)} USDC`);
        },
        onError: e => toast.error(e.message),
    });

    const [amount, setAmount] = useState("");

    const totalEarned = earnings?.totalLamports ?? 0;
    const last30 = earnings?.last30DaysLamports ?? 0;
    const pendingPayouts = (payoutHistory ?? []).filter(p => p.status === "pending" || p.status === "processing")
        .reduce((s, p) => s + p.amountLamports, 0);
    const available = Math.max(0, totalEarned - pendingPayouts);

    const claimableNet = claimable?.netUsdc ?? 0;

    return (
        <div className="space-y-6">
            {/* USDC subscription earnings — claim model */}
            <div className="rounded-xl bg-gradient-to-br from-white/10 to-zinc-900/60 border border-white/10 p-4">
                <p className="text-xs text-zinc-400 mb-1">Claimable subscription earnings (USDC)</p>
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <p className="text-2xl font-extrabold text-zinc-100">${(claimableNet / 1_000_000).toFixed(2)}</p>
                        <p className="text-[11px] text-zinc-500">
                            after {((claimable?.feeBps ?? 500) / 100).toFixed(0)}% platform fee
                            {claimable && claimable.grossUsdc > 0 ? ` · $${(claimable.grossUsdc / 1_000_000).toFixed(2)} gross` : ""}
                        </p>
                    </div>
                    <button
                        onClick={() => claim.mutate()}
                        disabled={claim.isPending || claimableNet <= 0}
                        className="rounded-full bg-white text-zinc-950 font-bold text-sm px-5 h-10 hover:bg-white/90 transition-colors disabled:opacity-50"
                    >
                        {claim.isPending ? "Claiming…" : "Claim to wallet"}
                    </button>
                </div>
            </div>

            {/* Stats (legacy SOL) */}
            <div className="grid grid-cols-3 gap-3">
                {earningsLoading ? (
                    Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
                ) : (
                    <>
                        <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-3">
                            <p className="text-xs text-zinc-500 mb-1">Total Earned</p>
                            <p className="text-lg font-bold text-zinc-100">{lamportsToSol(totalEarned)} SOL</p>
                        </div>
                        <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-3">
                            <p className="text-xs text-zinc-500 mb-1">Last 30 Days</p>
                            <p className="text-lg font-bold text-white">{lamportsToSol(last30)} SOL</p>
                        </div>
                        <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-3">
                            <p className="text-xs text-zinc-500 mb-1">Available</p>
                            <p className="text-lg font-bold text-zinc-100">{lamportsToSol(available)} SOL</p>
                        </div>
                    </>
                )}
            </div>

            {/* Request payout */}
            <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-3">
                <p className="text-sm font-semibold text-zinc-300">Request Payout</p>
                <p className="text-xs text-zinc-500">Earnings are sent to your connected Solana wallet. Payouts are processed within 1-3 business days.</p>
                <div className="flex gap-2">
                    <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="Amount in SOL"
                        className="flex-1 bg-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 rounded-lg px-3 py-2 border border-white/10 focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                    <button
                        onClick={() => requestPayout.mutate({ amountLamports: solToLamports(amount) })}
                        disabled={!amount || parseFloat(amount) <= 0 || requestPayout.isPending}
                        className="px-4 py-2 rounded-lg bg-white text-zinc-950 text-sm font-bold hover:bg-white/90 transition-colors disabled:opacity-50"
                    >
                        {requestPayout.isPending ? "Requesting…" : "Request"}
                    </button>
                </div>
            </div>

            {/* Earnings history */}
            {(earnings?.history?.length ?? 0) > 0 && (
                <div className="space-y-2">
                    <p className="text-sm font-semibold text-zinc-300">Earnings History</p>
                    {earnings!.history.slice(0, 20).map(e => (
                        <div key={e.id} className="flex items-center justify-between py-2 border-b border-white/5">
                            <div>
                                <p className="text-xs text-zinc-400 capitalize">{e.type.replace("_", " ")}</p>
                                <p className="text-xs text-zinc-600">{formatDistanceToNow(new Date(e.createdAt))} ago</p>
                            </div>
                            <span className="text-sm font-semibold text-white">+{lamportsToSol(e.amountLamports)} SOL</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Payout history */}
            {(payoutHistory?.length ?? 0) > 0 && (
                <div className="space-y-2">
                    <p className="text-sm font-semibold text-zinc-300">Payout History</p>
                    {payoutHistory!.map(p => {
                        const cfg = STATUS_CONFIG[p.status as keyof typeof STATUS_CONFIG];
                        return (
                            <div key={p.id} className="flex items-center justify-between py-2 border-b border-white/5">
                                <div className={`flex items-center gap-1.5 text-xs ${cfg.color}`}>
                                    {cfg.icon}{cfg.label}
                                    <span className="text-zinc-600 ml-1">{formatDistanceToNow(new Date(p.createdAt))} ago</span>
                                </div>
                                <span className="text-sm font-semibold text-zinc-300">{lamportsToSol(p.amountLamports)} SOL</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
