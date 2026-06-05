"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Edit2, Trash2, Check, Crown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const SOL = 1_000_000_000;

function lamportsToSol(l: number) {
    return (l / SOL).toFixed(3).replace(/\.?0+$/, "");
}
function solToLamports(s: string) {
    return Math.round(parseFloat(s) * SOL);
}

function TierForm({ initial, onSave, onCancel }: {
    initial?: { name: string; description?: string | null; priceMonthly: number; priceAnnual?: number | null; perks: string[] };
    onSave: (data: any) => void;
    onCancel: () => void;
}) {
    const [name, setName] = useState(initial?.name ?? "");
    const [description, setDescription] = useState(initial?.description ?? "");
    const [priceMonthly, setPriceMonthly] = useState(initial ? lamportsToSol(initial.priceMonthly) : "");
    const [priceAnnual, setPriceAnnual] = useState(initial?.priceAnnual ? lamportsToSol(initial.priceAnnual) : "");
    const [perks, setPerks] = useState<string[]>(initial?.perks ?? [""]);

    const addPerk = () => setPerks(p => [...p, ""]);
    const setPerk = (i: number, v: string) => setPerks(p => p.map((x, j) => j === i ? v : x));
    const removePerk = (i: number) => setPerks(p => p.filter((_, j) => j !== i));

    const handleSave = () => {
        if (!name.trim() || !priceMonthly) return;
        onSave({
            name: name.trim(),
            description: description.trim() || undefined,
            priceMonthly: solToLamports(priceMonthly),
            priceAnnual: priceAnnual ? solToLamports(priceAnnual) : undefined,
            perks: perks.filter(p => p.trim()),
        });
    };

    return (
        <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-3">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Tier name (e.g. Fan, Super Fan)"
                className="w-full bg-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 rounded-lg px-3 py-2 border border-white/10 focus:outline-none focus:ring-2 focus:ring-lantern/40" />
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description (optional)"
                className="w-full bg-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 rounded-lg px-3 py-2 border border-white/10 focus:outline-none focus:ring-2 focus:ring-lantern/40" />
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Monthly price (SOL)</label>
                    <input type="number" step="0.001" min="0" value={priceMonthly} onChange={e => setPriceMonthly(e.target.value)} placeholder="0.05"
                        className="w-full bg-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 rounded-lg px-3 py-2 border border-white/10 focus:outline-none focus:ring-2 focus:ring-lantern/40" />
                </div>
                <div>
                    <label className="text-xs text-zinc-500 mb-1 block">Annual price (SOL, optional)</label>
                    <input type="number" step="0.001" min="0" value={priceAnnual} onChange={e => setPriceAnnual(e.target.value)} placeholder="0.50"
                        className="w-full bg-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 rounded-lg px-3 py-2 border border-white/10 focus:outline-none focus:ring-2 focus:ring-lantern/40" />
                </div>
            </div>
            <div className="space-y-2">
                <label className="text-xs text-zinc-500 block">Perks</label>
                {perks.map((p, i) => (
                    <div key={i} className="flex gap-2">
                        <input value={p} onChange={e => setPerk(i, e.target.value)} placeholder={`Perk ${i + 1}`}
                            className="flex-1 bg-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 rounded-lg px-3 py-2 border border-white/10 focus:outline-none focus:ring-2 focus:ring-lantern/40" />
                        <button onClick={() => removePerk(i)} className="text-zinc-600 hover:text-red-400 transition-colors">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
                {perks.length < 10 && (
                    <button onClick={addPerk} className="text-xs text-zinc-500 hover:text-lantern transition-colors flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Add perk
                    </button>
                )}
            </div>
            <div className="flex gap-2 pt-1">
                <button onClick={onCancel} className="flex-1 py-2 rounded-xl bg-zinc-800 text-sm text-zinc-400 hover:bg-zinc-700 transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={!name.trim() || !priceMonthly}
                    className="flex-1 py-2 rounded-xl bg-lantern text-zinc-950 text-sm font-bold hover:bg-lantern/90 transition-colors disabled:opacity-50">
                    Save Tier
                </button>
            </div>
        </div>
    );
}

export function SubscriptionTierManager({ creatorId }: { creatorId: string }) {
    const utils = trpc.useUtils();
    const { data: tiers, isLoading } = trpc.subscription.getTiers.useQuery({ creatorId });
    const createTier = trpc.subscription.createTier.useMutation({
        onSuccess: () => { utils.subscription.getTiers.invalidate({ creatorId }); setAdding(false); toast.success("Tier created"); },
    });
    const updateTier = trpc.subscription.updateTier.useMutation({
        onSuccess: () => { utils.subscription.getTiers.invalidate({ creatorId }); setEditingId(null); toast.success("Tier updated"); },
    });
    const deleteTier = trpc.subscription.deleteTier.useMutation({
        onSuccess: () => { utils.subscription.getTiers.invalidate({ creatorId }); toast.success("Tier removed"); },
    });

    const [adding, setAdding] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    if (isLoading) return <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>;

    return (
        <div className="space-y-3">
            {(tiers ?? []).map(tier => (
                editingId === tier.id ? (
                    <TierForm
                        key={tier.id}
                        initial={tier as any}
                        onSave={data => updateTier.mutate({ tierId: tier.id, ...data })}
                        onCancel={() => setEditingId(null)}
                    />
                ) : (
                    <div key={tier.id} className="flex items-start gap-3 p-4 rounded-xl bg-zinc-900/60 border border-white/10">
                        <Crown className="w-5 h-5 text-lantern shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-zinc-100">{tier.name}</p>
                            {tier.description && <p className="text-xs text-zinc-500 mt-0.5">{tier.description}</p>}
                            <p className="text-xs text-lantern font-semibold mt-1">
                                {lamportsToSol(tier.priceMonthly)} SOL/mo
                                {tier.priceAnnual && ` · ${lamportsToSol(tier.priceAnnual)} SOL/yr`}
                            </p>
                            {((tier.perks as string[]) ?? []).length > 0 && (
                                <ul className="mt-2 space-y-0.5">
                                    {(tier.perks as string[]).map((p, i) => (
                                        <li key={i} className="flex items-center gap-1.5 text-xs text-zinc-400">
                                            <Check className="w-3 h-3 text-lantern shrink-0" />{p}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                            <button onClick={() => setEditingId(tier.id)} className="p-1.5 text-zinc-500 hover:text-zinc-200 transition-colors">
                                <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteTier.mutate({ tierId: tier.id })} className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )
            ))}

            {adding ? (
                <TierForm
                    onSave={data => createTier.mutate(data)}
                    onCancel={() => setAdding(false)}
                />
            ) : (tiers ?? []).length < 3 && (
                <button onClick={() => setAdding(true)}
                    className="w-full py-3 rounded-xl border border-dashed border-white/15 text-sm text-zinc-500 hover:border-lantern/40 hover:text-lantern transition-colors flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" /> Add subscription tier
                </button>
            )}

            {(tiers ?? []).length === 0 && !adding && (
                <div className="text-center py-8 text-zinc-600 text-sm">
                    No subscription tiers yet. Create up to 3 tiers.
                </div>
            )}
        </div>
    );
}
