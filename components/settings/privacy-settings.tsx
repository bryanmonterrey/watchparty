"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { Shield } from "lucide-react";
import { toast } from "sonner";

const SOL = 1_000_000_000;

export function PrivacySettings() {
    const { data: session } = useAuthSession();
    const utils = trpc.useUtils();

    const [showOnlineStatus, setShowOnlineStatus] = useState(true);
    const [dmRequireFollow, setDmRequireFollow] = useState(false);
    const [dmPriceSol, setDmPriceSol] = useState("");  // "" means free

    useEffect(() => {
        const u = session?.user as { showOnlineStatus?: boolean; dmRequireFollow?: boolean; dmPrice?: number | null } | undefined;
        if (u) {
            setShowOnlineStatus(u.showOnlineStatus ?? true);
            setDmRequireFollow(u.dmRequireFollow ?? false);
            setDmPriceSol(u.dmPrice ? (u.dmPrice / SOL).toFixed(3) : "");
        }
    }, [session]);

    const update = trpc.user.updatePrivacySettings.useMutation({
        onSuccess: () => { toast.success("Privacy settings saved"); utils.invalidate(); },
        onError: (e) => toast.error(e.message),
    });

    const SETTINGS = [
        {
            key: "showOnlineStatus" as const,
            label: "Show online status",
            description: "Let others see when you're active",
            value: showOnlineStatus,
            set: setShowOnlineStatus,
        },
        {
            key: "dmRequireFollow" as const,
            label: "Restrict DMs to followers",
            description: "Only people you follow back can send you messages",
            value: dmRequireFollow,
            set: setDmRequireFollow,
        },
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-lantern" />
                <h2 className="text-base font-bold text-zinc-100">Privacy</h2>
            </div>

            <div className="rounded-xl bg-zinc-900/60 border border-white/10 divide-y divide-white/5">
                {SETTINGS.map(({ label, description, value, set }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-3">
                        <div>
                            <p className="text-sm font-medium text-zinc-200">{label}</p>
                            <p className="text-xs text-zinc-500">{description}</p>
                        </div>
                        <button
                            onClick={() => set(v => !v)}
                            className={`relative w-11 h-6 rounded-full transition-colors ${value ? "bg-lantern" : "bg-zinc-700"}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-5" : "translate-x-0"}`} />
                        </button>
                    </div>
                ))}
            </div>

            {/* DM Paywall */}
            <div className="rounded-xl bg-zinc-900/60 border border-white/10 p-4 space-y-2">
                <div>
                    <p className="text-sm font-medium text-zinc-200">DM paywall</p>
                    <p className="text-xs text-zinc-500">Charge a fee (in SOL) for non-followers to message you. Leave blank for free.</p>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        step="0.001"
                        min="0"
                        value={dmPriceSol}
                        onChange={e => setDmPriceSol(e.target.value)}
                        placeholder="0.00 (free)"
                        className="flex-1 bg-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 rounded-lg px-3 py-2 border border-white/10 focus:outline-none focus:ring-2 focus:ring-lantern/40"
                    />
                    <span className="text-sm text-zinc-500 shrink-0">SOL</span>
                </div>
            </div>

            <button
                onClick={() => update.mutate({
                    showOnlineStatus,
                    dmRequireFollow,
                    dmPrice: dmPriceSol ? Math.round(parseFloat(dmPriceSol) * SOL) : 0,
                })}
                disabled={update.isPending}
                className="w-full py-2 rounded-lg bg-lantern text-zinc-950 font-bold text-sm hover:bg-lantern/90 transition-colors disabled:opacity-50"
            >
                {update.isPending ? "Saving…" : "Save"}
            </button>
        </div>
    );
}
