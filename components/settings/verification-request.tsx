"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { HugeiconsIcon } from "@hugeicons/react";
import { CancelCircleIcon, CheckmarkCircle02Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";
import { VerifiedBadgeIcon, BusinessBadgeIcon, GovBadgeIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Squircle } from "@/components/ui/squircle";
import { FieldLabel, Panel, PillButton } from "@/components/settings/ui";

const TIERS = [
    { id: "verified" as const, label: "Verified", icon: <VerifiedBadgeIcon className="size-5" />, desc: "Individual creators, public figures, journalists" },
    { id: "business" as const, label: "Business", icon: <BusinessBadgeIcon className="size-5" />, desc: "Companies, brands, organizations" },
    { id: "government" as const, label: "Government", icon: <GovBadgeIcon className="size-5" />, desc: "Government officials, agencies, political figures" },
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
            <Panel className="space-y-3 p-8 text-center">
                <HugeiconsIcon icon={Clock01Icon} className="mx-auto size-10 text-sunset" strokeWidth={2} />
                <p className="text-[14px] font-bold text-white">Request under review</p>
                <p className="text-[13px] font-medium text-zinc-500">Your verification request is being reviewed. We'll notify you once a decision is made.</p>
                <p className="text-[12px] font-medium text-zinc-600">Requested: {TIERS.find(t => t.id === existing.requestedTier)?.label} badge</p>
            </Panel>
        );
    }

    if (existing?.status === "approved") {
        return (
            <Panel className="space-y-2 p-8 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.06)]">
                <HugeiconsIcon icon={CheckmarkCircle02Icon} className="mx-auto size-10 text-white" strokeWidth={2} />
                <p className="text-[14px] font-bold text-white">Verification approved</p>
                <p className="text-[13px] font-medium text-zinc-400">Your account has been verified.</p>
            </Panel>
        );
    }

    const rejectedBanner = existing?.status === "rejected" && (
        <Squircle asChild radius={16} autoEffects={false}>
            <div className="space-y-1 bg-pastelred/10 p-4">
                <div className="flex items-center gap-2 text-pastelred">
                    <HugeiconsIcon icon={CancelCircleIcon} className="size-4" strokeWidth={2} />
                    <span className="text-[13px] font-semibold">Request rejected</span>
                </div>
                {existing.rejectionReason && (
                    <p className="text-[12px] font-medium text-pastelred/80">{existing.rejectionReason}</p>
                )}
                <p className="text-[12px] font-medium text-zinc-500">You can re-submit a new request below.</p>
            </div>
        </Squircle>
    );

    return (
        <div className="space-y-5">
            {rejectedBanner}

            <div className="space-y-1">
                <p className="text-[14px] font-semibold text-zinc-300">Request verification</p>
                <p className="text-[12px] font-medium text-zinc-500">Apply for a verification badge to show your account is authentic.</p>
            </div>

            {/* Tier selector */}
            <div className="grid grid-cols-3 gap-2">
                {TIERS.map(t => (
                    <Squircle asChild radius={16} key={t.id}>
                        <button
                            onClick={() => setTier(t.id)}
                            className={cn(
                                "cursor-pointer space-y-1 p-3 text-left transition-colors",
                                tier === t.id ? "bg-white/10" : "bg-panel hover:bg-white/5",
                            )}
                        >
                            {t.icon}
                            <p className={cn("text-[13px] font-bold", tier === t.id ? "text-white" : "text-zinc-300")}>{t.label}</p>
                            <p className="text-[11px] leading-tight text-zinc-500">{t.desc}</p>
                        </button>
                    </Squircle>
                ))}
            </div>

            <div className="space-y-3">
                <div className="space-y-1">
                    <FieldLabel>Full legal name *</FieldLabel>
                    <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" className="h-11 text-[13px]" />
                </div>
                <div className="space-y-1">
                    <FieldLabel>Website or official link</FieldLabel>
                    <Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://yoursite.com" className="h-11 text-[13px]" />
                </div>
                <div className="space-y-1">
                    <FieldLabel>Twitter / X handle</FieldLabel>
                    <Input value={twitterHandle} onChange={e => setTwitterHandle(e.target.value)} placeholder="@handle" className="h-11 text-[13px]" />
                </div>
                <div className="space-y-1">
                    <FieldLabel>Why do you deserve verification? *</FieldLabel>
                    <Squircle asChild radius={14}>
                        <textarea
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            rows={4}
                            placeholder="Describe your public presence, notable work, audience size, etc. (min 20 chars)"
                            className="w-full resize-none rounded-none bg-white/[0.06] px-4 py-3 text-[13px] font-medium text-white outline-none transition-colors placeholder:text-zinc-600 focus:bg-white/[0.1]"
                        />
                    </Squircle>
                    <p className="text-[12px] font-medium text-zinc-600">{reason.length}/1000</p>
                </div>
            </div>

            <PillButton
                variant="primary"
                className="h-11 w-full"
                onClick={() => submit.mutate({ requestedTier: tier, fullName, bio: bio || undefined, website: website || undefined, twitterHandle: twitterHandle || undefined, reason })}
                disabled={submit.isPending || !fullName.trim() || reason.length < 20}
            >
                {submit.isPending ? "Submitting…" : "Submit request"}
            </PillButton>
        </div>
    );
}
