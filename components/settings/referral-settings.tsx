"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon, UserGroup02Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Input } from "@/components/ui/input";
import { Squircle } from "@/components/ui/squircle";
import { Panel, PanelSkeleton, PillButton } from "@/components/settings/ui";

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

    if (isLoading) return <PanelSkeleton rows={2} rowClassName="h-20" />;

    return (
        <div className="space-y-4">
            {/* My code */}
            <Panel className="space-y-3 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
                <p className="text-[14px] font-semibold text-zinc-300">Your referral link</p>
                {code ? (
                    <div className="flex items-center gap-1.5">
                        <Squircle asChild radius={12}>
                            <code className="flex-1 truncate bg-white/[0.06] px-3 py-2.5 text-[12px] text-zinc-300">
                                {referralLink}
                            </code>
                        </Squircle>
                        <button onClick={copyLink} className="shrink-0 cursor-pointer rounded-full p-2 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white">
                            <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className={copied ? "size-4 text-white" : "size-4"} strokeWidth={2} />
                        </button>
                    </div>
                ) : (
                    <p className="text-[12px] font-medium text-zinc-500">Generating your code…</p>
                )}
                <p className="text-[12px] font-medium text-zinc-500">Share this link to invite friends. You'll earn rewards when they join.</p>
            </Panel>

            {/* Stats */}
            <Panel className="flex items-center gap-3 p-5">
                <HugeiconsIcon icon={UserGroup02Icon} className="size-5 shrink-0 text-zinc-400" strokeWidth={2} />
                <div>
                    <p className="text-[15px] font-bold tabular-nums text-white">{stats?.totalReferrals ?? 0} referrals</p>
                    <p className="text-[12px] font-medium text-zinc-500">People who joined using your link</p>
                </div>
            </Panel>

            {/* Referral list */}
            {(stats?.referrals?.length ?? 0) > 0 && (
                <Panel className="pb-1.5">
                    <p className="px-4 pb-1 pt-4 text-[14px] font-semibold text-zinc-500">Referred users</p>
                    {stats!.referrals.map(r => (
                        <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.04]">
                            <Link href={`/${r.referredUser.username}`}>
                                {r.referredUser.avatar_url
                                    ? <img src={r.referredUser.avatar_url} className="size-8 rounded-full object-cover" alt={r.referredUser.name} />
                                    : <div className="flex size-8 items-center justify-center rounded-full bg-white/10 text-[12px] font-bold text-zinc-400">{r.referredUser.name?.[0]}</div>
                                }
                            </Link>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[14px] font-semibold text-zinc-200">{r.referredUser.name}</p>
                                <p className="text-[12px] font-medium text-zinc-500">Joined {formatDistanceToNow(new Date(r.createdAt))} ago</p>
                            </div>
                            <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold capitalize ${r.status === "completed" ? "bg-white/10 text-white" : "bg-white/5 text-zinc-500"}`}>
                                {r.status}
                            </span>
                        </div>
                    ))}
                </Panel>
            )}

            {/* Apply a code */}
            <Panel className="space-y-3 p-5">
                <div>
                    <p className="text-[14px] font-semibold text-zinc-300">Apply a referral code</p>
                    <p className="text-[12px] font-medium text-zinc-500">If someone referred you, enter their code to credit them.</p>
                </div>
                <div className="flex gap-2">
                    <Input
                        value={applyInput}
                        onChange={e => setApplyInput(e.target.value.toUpperCase())}
                        placeholder="XXXXXX"
                        maxLength={12}
                        className="h-10 flex-1 text-[13px] tracking-widest"
                        radius={12}
                    />
                    <PillButton
                        onClick={() => applyCode.mutate({ code: applyInput })}
                        disabled={applyInput.length < 4 || applyCode.isPending}
                    >
                        {applyCode.isPending ? "Applying…" : "Apply"}
                    </PillButton>
                </div>
            </Panel>
        </div>
    );
}
