"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { AlertCircleIcon, CheckmarkCircle02Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { Panel, PanelSkeleton, PillButton } from "@/components/settings/ui";

const SOL = 1_000_000_000;
function lamportsToSol(l: number) {
    return (l / SOL).toFixed(4);
}
function solToLamports(s: string) {
    return Math.round(parseFloat(s) * SOL);
}

const STATUS_CONFIG: Record<string, { icon: IconSvgElement; color: string; label: string }> = {
    pending:    { icon: Clock01Icon,           color: "text-sunset",    label: "Pending" },
    processing: { icon: Clock01Icon,           color: "text-twitter2",  label: "Processing" },
    completed:  { icon: CheckmarkCircle02Icon, color: "text-white",     label: "Completed" },
    failed:     { icon: AlertCircleIcon,       color: "text-pastelred", label: "Failed" },
};

function StatCard({ label, value }: { label: string; value: string }) {
    return (
        <Panel className="p-4">
            <p className="mb-1 text-[12px] font-medium text-zinc-500">{label}</p>
            <p className="text-[15px] font-bold tabular-nums tracking-tight text-white">{value}</p>
        </Panel>
    );
}

export function PayoutSettings() {
    const utils = trpc.useUtils();
    const { data: earnings, isLoading: earningsLoading } = trpc.subscription.getEarnings.useQuery();
    const { data: payoutHistory } = trpc.subscription.getPayouts.useQuery();

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
        <div className="space-y-4">
            {/* USDC subscription earnings — the panel's one focal moment */}
            <Panel className="p-5">
                <p className="mb-1 text-[12px] font-medium text-zinc-500">Claimable subscription earnings (USDC)</p>
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <p className="text-2xl font-bold tabular-nums tracking-tight text-white">${(claimableNet / 1_000_000).toFixed(2)}</p>
                        <p className="text-[12px] font-medium text-zinc-500">
                            after {((claimable?.feeBps ?? 500) / 100).toFixed(0)}% platform fee
                            {claimable && claimable.grossUsdc > 0 ? ` · $${(claimable.grossUsdc / 1_000_000).toFixed(2)} gross` : ""}
                        </p>
                    </div>
                    <PillButton
                        variant="primary"
                        onClick={() => claim.mutate()}
                        disabled={claim.isPending || claimableNet <= 0}
                    >
                        {claim.isPending ? "Claiming…" : "Claim to wallet"}
                    </PillButton>
                </div>
            </Panel>

            {/* Stats (legacy SOL) */}
            {earningsLoading ? (
                <div className="grid grid-cols-3 gap-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-20 overflow-hidden rounded-[20px]"><div className="size-full shimmer-skeleton" /></div>
                    ))}
                </div>
            ) : (
                <div className="grid grid-cols-3 gap-3">
                    <StatCard label="Total earned" value={`${lamportsToSol(totalEarned)} SOL`} />
                    <StatCard label="Last 30 days" value={`${lamportsToSol(last30)} SOL`} />
                    <StatCard label="Available" value={`${lamportsToSol(available)} SOL`} />
                </div>
            )}

            {/* Request payout */}
            <Panel className="space-y-3 p-5">
                <div>
                    <p className="text-[14px] font-semibold text-zinc-300">Request payout</p>
                    <p className="text-[12px] font-medium text-zinc-500">Earnings are sent to your connected Solana wallet. Payouts are processed within 1-3 business days.</p>
                </div>
                <div className="flex gap-2">
                    <Input
                        type="number"
                        step="0.001"
                        min="0"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="Amount in SOL"
                        className="h-10 flex-1 text-[13px] [&::-webkit-inner-spin-button]:appearance-none"
                        radius={12}
                    />
                    <PillButton
                        variant="primary"
                        onClick={() => requestPayout.mutate({ amountLamports: solToLamports(amount) })}
                        disabled={!amount || parseFloat(amount) <= 0 || requestPayout.isPending}
                    >
                        {requestPayout.isPending ? "Requesting…" : "Request"}
                    </PillButton>
                </div>
            </Panel>

            {/* Earnings history */}
            {(earnings?.history?.length ?? 0) > 0 && (
                <Panel className="pb-1.5">
                    <p className="px-4 pb-1 pt-4 text-[14px] font-semibold text-zinc-500">Earnings history</p>
                    {earnings!.history.slice(0, 20).map(e => (
                        <div key={e.id} className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-white/[0.04]">
                            <div>
                                <p className="text-[13px] font-medium capitalize text-zinc-300">{e.type.replace("_", " ")}</p>
                                <p className="text-[12px] font-medium text-zinc-600">{formatDistanceToNow(new Date(e.createdAt))} ago</p>
                            </div>
                            <span className="text-[14px] font-semibold tabular-nums text-white">+{lamportsToSol(e.amountLamports)} SOL</span>
                        </div>
                    ))}
                </Panel>
            )}

            {/* Payout history */}
            {(payoutHistory?.length ?? 0) > 0 && (
                <Panel className="pb-1.5">
                    <p className="px-4 pb-1 pt-4 text-[14px] font-semibold text-zinc-500">Payout history</p>
                    {payoutHistory!.map(p => {
                        const cfg = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.pending;
                        return (
                            <div key={p.id} className="flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-white/[0.04]">
                                <div className={`flex items-center gap-1.5 text-[12px] font-medium ${cfg.color}`}>
                                    <HugeiconsIcon icon={cfg.icon} className="size-3.5" strokeWidth={2} />
                                    {cfg.label}
                                    <span className="ml-1 text-zinc-600">{formatDistanceToNow(new Date(p.createdAt))} ago</span>
                                </div>
                                <span className="text-[14px] font-semibold tabular-nums text-zinc-300">{lamportsToSol(p.amountLamports)} SOL</span>
                            </div>
                        );
                    })}
                </Panel>
            )}
        </div>
    );
}
