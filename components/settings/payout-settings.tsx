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
    completed:  { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: "text-lantern",    label: "Completed" },
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

    const [amount, setAmount] = useState("");

    const totalEarned = earnings?.totalLamports ?? 0;
    const last30 = earnings?.last30DaysLamports ?? 0;
    const pendingPayouts = (payoutHistory ?? []).filter(p => p.status === "pending" || p.status === "processing")
        .reduce((s, p) => s + p.amountLamports, 0);
    const available = Math.max(0, totalEarned - pendingPayouts);

    return (
        <div className="space-y-6">
            {/* Stats */}
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
                            <p className="text-lg font-bold text-lantern">{lamportsToSol(last30)} SOL</p>
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
                        className="flex-1 bg-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 rounded-lg px-3 py-2 border border-white/10 focus:outline-none focus:ring-2 focus:ring-lantern/40"
                    />
                    <button
                        onClick={() => requestPayout.mutate({ amountLamports: solToLamports(amount) })}
                        disabled={!amount || parseFloat(amount) <= 0 || requestPayout.isPending}
                        className="px-4 py-2 rounded-lg bg-lantern text-zinc-950 text-sm font-bold hover:bg-lantern/90 transition-colors disabled:opacity-50"
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
                            <span className="text-sm font-semibold text-lantern">+{lamportsToSol(e.amountLamports)} SOL</span>
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
