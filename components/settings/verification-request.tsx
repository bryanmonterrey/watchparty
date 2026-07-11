"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { ShieldCheck, Clock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";

const TIERS = [
    { id: "verified" as const, label: "Verified", icon: <VerifiedBadgeIcon className="w-5 h-5" />, desc: "Individual creators, public figures, journalists" },
    { id: "business" as const, label: "Business", icon: <BusinessBadgeIcon className="w-5 h-5" />, desc: "Companies, brands, organizations" },
    { id: "government" as const, label: "Government", icon: <GovBadgeIcon className="w-5 h-5" />, desc: "Government officials, agencies, political figures" },
];

export function VerificationRequest() {
    const utils = trpc.useUtils();
    const { data: existing, isLoading } = trpc.moderation.getMyVerificationRequest.useQuery();
    const submit = trpc.moderation.submitVerificationRequest.useMutation({
        onSuccess: () => { utils.moderation.getMyVerificationRequest.invalidate(); toast.success("Verification request submitted"); },
        onError: (e) => toast.error(e.message),
    });

    const [tier, setTier] = useState<"verified" | "business" | "government">("verified");
    const [fullName, setFullName] = useState("");
    const [bio, setBio] = useState("");
    const [website, setWebsite] = useState("");
    const [twitterHandle, setTwitterHandle] = useState("");
    const [reason, setReason] = useState("");

    useEffect(() => {
        if (existing) {
            setTier(existing.requestedTier);
            setFullName(existing.fullName);
            setBio(existing.bio ?? "");
            setWebsite(existing.website ?? "");
            setTwitterHandle(existing.twitterHandle ?? "");
            setReason(existing.reason);
        }
    }, [existing]);

    if (isLoading) return null;

    // Show status if submitted
    if (existing?.status === "pending") {
        return (
            <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-6 space-y-3 text-center">
                <Clock className="w-10 h-10 mx-auto text-amber-400" />
                <p className="font-semibold text-zinc-100">Request Under Review</p>
                <p className="text-sm text-zinc-500">Your verification request is being reviewed. We'll notify you once a decision is made.</p>
                <p className="text-xs text-zinc-600">Requested: {TIERS.find(t => t.id === existing.requestedTier)?.label} badge</p>
            </div>
        );
    }

    if (existing?.status === "approved") {
        return (
            <div className="rounded-xl bg-white/10 border border-white/10 p-6 space-y-2 text-center">
                <CheckCircle2 className="w-10 h-10 mx-auto text-white" />
                <p className="font-semibold text-zinc-100">Verification Approved</p>
                <p className="text-sm text-zinc-400">Your account has been verified.</p>
            </div>
        );
    }

    if (existing?.status === "rejected") {
        return (
            <div className="space-y-4">
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 space-y-1">
                    <div className="flex items-center gap-2 text-red-400">
                        <XCircle className="w-4 h-4" />
                        <span className="text-sm font-semibold">Request Rejected</span>
                    </div>
                    {existing.rejectionReason && (
                        <p className="text-xs text-red-300/80">{existing.rejectionReason}</p>
                    )}
                    <p className="text-xs text-zinc-500">You can re-submit a new request below.</p>
                </div>
                {/* Fall through to form */}
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-300">Request Verification</p>
                <p className="text-xs text-zinc-500">Apply for a verification badge to show your account is authentic.</p>
            </div>

            {/* Tier selector */}
            <div className="grid grid-cols-3 gap-2">
                {TIERS.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTier(t.id)}
                        className={`p-3 rounded-xl border text-left space-y-1 transition-colors ${tier === t.id ? "border-white/20/50 bg-white/10" : "border-white/10 bg-zinc-900/60 hover:bg-white/5"}`}
                    >
                        {t.icon}
                        <p className="text-xs font-bold text-zinc-200">{t.label}</p>
                        <p className="text-[10px] text-zinc-500 leading-tight">{t.desc}</p>
                    </button>
                ))}
            </div>

            <div className="space-y-3">
                <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Full legal name *</label>
                    <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name"
                        className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/30" />
                </div>
                <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Website or official link</label>
                    <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yoursite.com"
                        className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/30" />
                </div>
                <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Twitter / X handle</label>
                    <input value={twitterHandle} onChange={e => setTwitterHandle(e.target.value)} placeholder="@handle"
                        className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/30" />
                </div>
                <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Why do you deserve verification? *</label>
                    <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4}
                        placeholder="Describe your public presence, notable work, audience size, etc. (min 20 chars)"
                        className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-white/30 resize-none" />
                    <p className="text-xs text-zinc-600 mt-0.5">{reason.length}/1000</p>
                </div>
            </div>

            <button
                onClick={() => submit.mutate({ requestedTier: tier, fullName, bio: bio || undefined, website: website || undefined, twitterHandle: twitterHandle || undefined, reason })}
                disabled={submit.isPending || !fullName.trim() || reason.length < 20}
                className="w-full py-2.5 rounded-xl bg-white text-zinc-950 text-sm font-bold hover:bg-white/90 transition-colors disabled:opacity-40"
            >
                {submit.isPending ? "Submitting…" : "Submit Request"}
            </button>
        </div>
    );
}
