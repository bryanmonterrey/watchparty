"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Gift, Crown, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SOL = 1_000_000_000;
function lamportsToSol(l: number) {
    return (l / SOL).toFixed(3).replace(/\.?0+$/, "");
}

interface GiftSubscriptionDialogProps {
    recipientId: string;
    recipientName: string;
    creatorId: string;
    open: boolean;
    onOpenChange: (o: boolean) => void;
}

export function GiftSubscriptionDialog({ recipientId, recipientName, creatorId, open, onOpenChange }: GiftSubscriptionDialogProps) {
    const { data: tiers } = trpc.subscription.getTiers.useQuery({ creatorId });
    const gift = trpc.subscription.giftSubscription.useMutation({
        onSuccess: () => { onOpenChange(false); toast.success(`Gift subscription sent to ${recipientName}!`); },
        onError: e => toast.error(e.message),
    });

    const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
    const [duration, setDuration] = useState(1);
    const [message, setMessage] = useState("");

    if (!open) return null;

    const selectedTier = tiers?.find(t => t.id === selectedTierId);
    const totalCost = selectedTier ? selectedTier.priceMonthly * duration : 0;

    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => onOpenChange(false)}>
            <div className="bg-zinc-950 border border-white/10 rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                    <Gift className="w-5 h-5 text-lantern" />
                    <h2 className="text-base font-bold text-zinc-100">Gift a subscription to {recipientName}</h2>
                </div>

                {/* Tier picker */}
                {(tiers ?? []).length > 0 ? (
                    <div className="space-y-2">
                        <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wide">Select tier</p>
                        {tiers!.map(tier => (
                            <button
                                key={tier.id}
                                onClick={() => setSelectedTierId(tier.id)}
                                className={cn(
                                    "w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors",
                                    selectedTierId === tier.id
                                        ? "border-lantern/50 bg-lantern/10"
                                        : "border-white/10 bg-zinc-900/60 hover:border-white/20"
                                )}
                            >
                                <Crown className={cn("w-4 h-4 shrink-0", selectedTierId === tier.id ? "text-lantern" : "text-zinc-500")} />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-zinc-100">{tier.name}</p>
                                    <p className="text-xs text-zinc-500">{lamportsToSol(tier.priceMonthly)} SOL/mo</p>
                                </div>
                                {selectedTierId === tier.id && <Check className="w-4 h-4 text-lantern shrink-0" />}
                            </button>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-zinc-500">This creator has no subscription tiers.</p>
                )}

                {/* Duration */}
                {selectedTierId && (
                    <div className="space-y-2">
                        <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wide">Duration</p>
                        <div className="flex gap-2 flex-wrap">
                            {[1, 3, 6, 12].map(m => (
                                <button
                                    key={m}
                                    onClick={() => setDuration(m)}
                                    className={cn(
                                        "px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors",
                                        duration === m ? "bg-lantern text-zinc-950 border-lantern" : "bg-zinc-800 text-zinc-400 border-white/10 hover:border-white/20"
                                    )}
                                >
                                    {m}mo
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-zinc-500">Total: <span className="text-lantern font-semibold">{lamportsToSol(totalCost)} SOL</span></p>
                    </div>
                )}

                {/* Message */}
                <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Add a message (optional)"
                    maxLength={200}
                    rows={2}
                    className="w-full bg-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 rounded-lg px-3 py-2 border border-white/10 focus:outline-none focus:ring-2 focus:ring-lantern/40 resize-none"
                />

                <div className="flex gap-2">
                    <button onClick={() => onOpenChange(false)} className="flex-1 py-2 rounded-xl bg-zinc-800 text-sm text-zinc-400 hover:bg-zinc-700 transition-colors">Cancel</button>
                    <button
                        onClick={() => gift.mutate({ recipientId, tierId: selectedTierId!, durationMonths: duration, message: message || undefined })}
                        disabled={!selectedTierId || gift.isPending}
                        className="flex-1 py-2 rounded-xl bg-lantern text-zinc-950 text-sm font-bold hover:bg-lantern/90 transition-colors disabled:opacity-50"
                    >
                        {gift.isPending ? "Gifting…" : "Send Gift"}
                    </button>
                </div>
            </div>
        </div>
    );
}
