"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Tag, Plus, Trash2, ToggleLeft, ToggleRight, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

export function PromoCodeManager() {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.creator.getMyCodes.useQuery();
    const createCode = trpc.creator.createCode.useMutation({
        onSuccess: () => { utils.creator.getMyCodes.invalidate(); setShowForm(false); setCode(""); setDiscount(10); },
        onError: (e) => toast.error(e.message),
    });
    const toggleCode = trpc.creator.toggleCode.useMutation({
        onSuccess: () => utils.creator.getMyCodes.invalidate(),
    });
    const deleteCode = trpc.creator.deleteCode.useMutation({
        onSuccess: () => { utils.creator.getMyCodes.invalidate(); toast.success("Code deleted"); },
    });

    const [showForm, setShowForm] = useState(false);
    const [code, setCode] = useState("");
    const [discount, setDiscount] = useState(10);
    const [maxUses, setMaxUses] = useState("");
    const [copied, setCopied] = useState<string | null>(null);

    const copy = (text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(text);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Tag className="w-5 h-5 text-lantern" />
                    <h2 className="text-base font-bold text-zinc-100">Promo Codes</h2>
                </div>
                <button onClick={() => setShowForm(v => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-lantern text-zinc-950 text-xs font-bold hover:bg-lantern/90 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> New Code
                </button>
            </div>

            {showForm && (
                <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-3">
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Create Promo Code</p>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-zinc-500 mb-1 block">Code</label>
                            <input
                                value={code}
                                onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ""))}
                                placeholder="SUMMER25"
                                maxLength={20}
                                className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-100 font-mono placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-lantern/50"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-zinc-500 mb-1 block">Discount %</label>
                            <input
                                type="number" min={1} max={100}
                                value={discount}
                                onChange={e => setDiscount(Number(e.target.value))}
                                className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-lantern/50"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-zinc-500 mb-1 block">Max Uses (optional)</label>
                            <input
                                type="number" min={1}
                                value={maxUses}
                                onChange={e => setMaxUses(e.target.value)}
                                placeholder="Unlimited"
                                className="w-full px-3 py-2 bg-zinc-800 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-lantern/50"
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button onClick={() => setShowForm(false)} className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:bg-white/5 transition-colors">Cancel</button>
                        <button
                            onClick={() => createCode.mutate({ code, discountPercent: discount, maxUses: maxUses ? Number(maxUses) : undefined })}
                            disabled={createCode.isPending || code.length < 3}
                            className="px-4 py-1.5 rounded-lg bg-lantern text-zinc-950 text-xs font-bold hover:bg-lantern/90 disabled:opacity-50 transition-colors"
                        >
                            {createCode.isPending ? "Creating…" : "Create"}
                        </button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
            ) : !data?.length ? (
                <div className="text-center py-10 space-y-2">
                    <Tag className="w-9 h-9 mx-auto text-zinc-700" />
                    <p className="text-sm text-zinc-500">No promo codes yet</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {data.map(c => (
                        <div key={c.id} className={cn("flex items-center gap-3 p-3 rounded-xl border", c.isActive ? "bg-zinc-900/60 border-white/10" : "bg-zinc-950/40 border-white/5 opacity-60")}>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm font-bold text-zinc-100">{c.code}</span>
                                    <span className="text-xs bg-lantern/10 text-lantern px-1.5 py-0.5 rounded font-semibold">{c.discountPercent}% off</span>
                                    {!c.isActive && <span className="text-xs text-zinc-600">inactive</span>}
                                </div>
                                <p className="text-xs text-zinc-500">
                                    {c.usedCount} uses{c.maxUses ? ` / ${c.maxUses}` : ""} · created {formatDistanceToNow(new Date(c.createdAt))} ago
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                <button onClick={() => copy(c.code)} className="p-1.5 text-zinc-500 hover:text-zinc-200 transition-colors">
                                    {copied === c.code ? <Check className="w-3.5 h-3.5 text-lantern" /> : <Copy className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => toggleCode.mutate({ codeId: c.id, isActive: !c.isActive })} className="p-1.5 text-zinc-500 hover:text-zinc-200 transition-colors">
                                    {c.isActive ? <ToggleRight className="w-4 h-4 text-lantern" /> : <ToggleLeft className="w-4 h-4" />}
                                </button>
                                <button onClick={() => deleteCode.mutate({ codeId: c.id })} className="p-1.5 text-zinc-500 hover:text-red-400 transition-colors">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
