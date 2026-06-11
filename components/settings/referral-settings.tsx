"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Check, Gift, Users } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

export function ReferralSettings() {
    const utils = trpc.useUtils();
    const { data: stats, isLoading } = trpc.referral.getStats.useQuery();
    const { data: codeData } = trpc.referral.getMyCode.useQuery();
    const applyCode = trpc.referral.applyCode.useMutation({
        onSuccess: () => { utils.referral.getStats.invalidate(); setApplyInput(""); toast.success("Referral code applied!"); },
        onError: e => toast.error(e.message),
    });

    const [copied, setCopied] = useState(false);
    const [applyInput, setApplyInput] = useState("");

    const code = codeData?.code ?? stats?.code;
    const referralLink = code ? `${typeof window !== "undefined" ? window.location.origin : ""}/?ref=${code}` : "";

    const copyLink = () => {
        if (!referralLink) return;
        navigator.clipboard.writeText(referralLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (isLoading) return <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>;

    return (
        <div className="space-y-5">
            {/* My code */}
            <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-3">
                <div className="flex items-center gap-2">
                    <Gift className="w-5 h-5 text-lantern" />
                    <p className="text-sm font-semibold text-zinc-300">Your referral link</p>
                </div>
                {code ? (
                    <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs  text-zinc-300 bg-zinc-800 px-3 py-2 rounded-lg truncate border border-white/10">
                            {referralLink}
                        </code>
                        <button onClick={copyLink} className="shrink-0 p-2 text-zinc-500 hover:text-zinc-200 transition-colors">
                            {copied ? <Check className="w-4 h-4 text-lantern" /> : <Copy className="w-4 h-4" />}
                        </button>
                    </div>
                ) : (
                    <p className="text-xs text-zinc-500">Generating your code…</p>
                )}
                <p className="text-xs text-zinc-500">Share this link to invite friends. You'll earn rewards when they join.</p>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-3 p-4 rounded-xl bg-zinc-900/60 border border-white/10">
                <Users className="w-5 h-5 text-zinc-400 shrink-0" />
                <div>
                    <p className="text-sm font-bold text-zinc-100">{stats?.totalReferrals ?? 0} referrals</p>
                    <p className="text-xs text-zinc-500">People who joined using your link</p>
                </div>
            </div>

            {/* Referral list */}
            {(stats?.referrals?.length ?? 0) > 0 && (
                <div className="space-y-2">
                    <p className="text-sm font-semibold text-zinc-300">Referred Users</p>
                    {stats!.referrals.map(r => (
                        <div key={r.id} className="flex items-center gap-3 py-2 border-b border-white/5">
                            <Link href={`/${r.referredUser.username}`}>
                                {r.referredUser.avatar_url
                                    ? <img src={r.referredUser.avatar_url} className="w-8 h-8 rounded-full object-cover" alt={r.referredUser.name} />
                                    : <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-bold text-xs">{r.referredUser.name?.[0]}</div>
                                }
                            </Link>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-zinc-200 truncate">{r.referredUser.name}</p>
                                <p className="text-xs text-zinc-500">Joined {formatDistanceToNow(new Date(r.createdAt))} ago</p>
                            </div>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${r.status === "completed" ? "bg-lantern/10 text-lantern" : "bg-zinc-800 text-zinc-500"}`}>
                                {r.status}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Apply a code */}
            <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-3">
                <p className="text-sm font-semibold text-zinc-300">Apply a referral code</p>
                <p className="text-xs text-zinc-500">If someone referred you, enter their code to credit them.</p>
                <div className="flex gap-2">
                    <input
                        value={applyInput}
                        onChange={e => setApplyInput(e.target.value.toUpperCase())}
                        placeholder="XXXXXX"
                        maxLength={12}
                        className="flex-1 bg-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 rounded-lg px-3 py-2 border border-white/10 focus:outline-none focus:ring-2 focus:ring-lantern/40  tracking-widest"
                    />
                    <button
                        onClick={() => applyCode.mutate({ code: applyInput })}
                        disabled={applyInput.length < 4 || applyCode.isPending}
                        className="px-4 py-2 rounded-lg bg-white/10 text-sm font-semibold text-zinc-200 hover:bg-white/15 transition-colors disabled:opacity-50"
                    >
                        {applyCode.isPending ? "Applying…" : "Apply"}
                    </button>
                </div>
            </div>
        </div>
    );
}
