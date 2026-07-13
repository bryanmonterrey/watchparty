"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Panel, PanelHeader, PillButton } from "@/components/settings/ui";

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
            <PanelHeader title="Privacy" />

            <Panel className="p-1.5">
                {SETTINGS.map(({ label, description, value, set }) => (
                    <div key={label} className="flex items-center justify-between gap-4 rounded-[18px] px-3.5 py-3 transition-colors hover:bg-white/[0.04]">
                        <div>
                            <p className="text-[14px] font-semibold text-zinc-200">{label}</p>
                            <p className="text-[12px] font-medium text-zinc-500">{description}</p>
                        </div>
                        <Switch checked={value} onCheckedChange={() => set(v => !v)} />
                    </div>
                ))}
            </Panel>

            {/* DM paywall */}
            <Panel className="space-y-3 p-5">
                <div>
                    <p className="text-[14px] font-semibold text-zinc-200">DM paywall</p>
                    <p className="text-[12px] font-medium text-zinc-500">Charge a fee (in SOL) for non-followers to message you. Leave blank for free.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Input
                        type="number"
                        step="0.001"
                        min="0"
                        value={dmPriceSol}
                        onChange={e => setDmPriceSol(e.target.value)}
                        placeholder="0.00 (free)"
                        className="h-11 flex-1 text-[13px] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="shrink-0 text-[13px] font-semibold text-zinc-500">SOL</span>
                </div>
            </Panel>

            <PillButton
                variant="primary"
                className="h-12 w-full"
                onClick={() => update.mutate({
                    showOnlineStatus,
                    dmRequireFollow,
                    dmPrice: dmPriceSol ? Math.round(parseFloat(dmPriceSol) * SOL) : 0,
                })}
                disabled={update.isPending}
            >
                {update.isPending ? "Saving…" : "Save"}
            </PillButton>
        </div>
    );
}
