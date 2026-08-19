"use client";

import * as React from "react";
import { Copy as CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { SubscribeButton } from "@/components/browse/subscribe-button";
import { trpc } from "@/lib/trpc/client";
import { useWalletSigning } from "@/hooks/use-wallet-signing";
import { cn } from "@/lib/utils";

interface CopyTradeDialogProps {
    traderId: string;
    traderName: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Copy-trading setup (docs/exp-callouts.md §4d). Access is the paid perk of a
 * creator subscription: unsubscribed users see the subscribe prompt; subscribed
 * users set caps + pause. Execution today: sized "Copy ready" pushes on every
 * buy the trader makes — tap to execute. Walk-away auto-execution arrives with
 * the on-chain Swig role delegation.
 */
export function CopyTradeDialog({ traderId, traderName, open, onOpenChange }: CopyTradeDialogProps) {
    const utils = trpc.useUtils();
    const { data: status } = trpc.copy.status.useQuery({ traderId }, { enabled: open });
    const [perCopy, setPerCopy] = React.useState("25");
    const [dailyCap, setDailyCap] = React.useState("100");
    const [paused, setPaused] = React.useState(false);

    React.useEffect(() => {
        if (status?.config) {
            setPerCopy(String(status.config.maxUsdcPerCopy));
            setDailyCap(String(status.config.dailyUsdcCap));
            setPaused(status.config.paused);
        }
    }, [status?.config]);

    const upsert = trpc.copy.upsert.useMutation({
        onSuccess: () => {
            toast.success(`Copying ${traderName} — you'll get a sized push on every buy`);
            utils.copy.status.invalidate({ traderId });
            utils.copy.mine.invalidate();
            onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
    });
    const remove = trpc.copy.remove.useMutation({
        onSuccess: () => {
            toast.success("Copy config removed");
            utils.copy.status.invalidate({ traderId });
            utils.copy.mine.invalidate();
            onOpenChange(false);
        },
        onError: (e) => toast.error(e.message),
    });

    const save = () => {
        const per = Number(perCopy);
        const daily = Number(dailyCap);
        if (!Number.isFinite(per) || per < 1) return toast.error("Per-copy amount must be at least $1");
        if (!Number.isFinite(daily) || daily < per) return toast.error("Daily cap must be at least the per-copy amount");
        upsert.mutate({ traderId, maxUsdcPerCopy: per, dailyUsdcCap: daily, paused });
    };

    // ── Walk-away auto-copy: sign once, chain enforces the daily cap ─────────
    const { data: autoAvail } = trpc.copy.autoCopyAvailable.useQuery(undefined, { enabled: open });
    const { signManagement, isPending: signing } = useWalletSigning();
    const confirmAuto = trpc.copy.confirmAutoCopy.useMutation();
    const confirmAutoDisabled = trpc.copy.confirmAutoCopyDisabled.useMutation();
    const [autoBusy, setAutoBusy] = React.useState(false);

    const enableAuto = async () => {
        const daily = Number(dailyCap);
        if (!Number.isFinite(daily) || daily < 1) return toast.error("Set a daily cap first");
        setAutoBusy(true);
        try {
            await signManagement("copyEnable", { dailyUsdcCap: daily });
            await confirmAuto.mutateAsync({ traderId });
            toast.success("Hands-free copying enabled — the chain enforces your daily cap");
            utils.copy.status.invalidate({ traderId });
            utils.copy.mine.invalidate();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Enable failed");
        } finally {
            setAutoBusy(false);
        }
    };

    const updateAutoCap = async () => {
        const daily = Number(dailyCap);
        if (!Number.isFinite(daily) || daily < 1) return toast.error("Set a daily cap first");
        setAutoBusy(true);
        try {
            await signManagement("copyUpdateCap", { dailyUsdcCap: daily });
            toast.success(`On-chain cap updated to $${daily}/day`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Update failed");
        } finally {
            setAutoBusy(false);
        }
    };

    const disableAuto = async () => {
        setAutoBusy(true);
        try {
            await signManagement("copyDisable");
            await confirmAutoDisabled.mutateAsync();
            toast.success("Hands-free copying disabled — executor role revoked on-chain");
            utils.copy.status.invalidate({ traderId });
            utils.copy.mine.invalidate();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Disable failed");
        } finally {
            setAutoBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md rounded-[25px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-white">
                        <CopyIcon className="size-4 text-lantern" /> Copy {traderName}
                    </DialogTitle>
                </DialogHeader>

                {!status ? (
                    <div className="shimmer-skeleton h-32 rounded-2xl" />
                ) : !status.subscribed ? (
                    <div className="flex flex-col items-center gap-4 py-4 text-center">
                        <p className="text-sm font-semibold text-zinc-300">
                            Copy trading is a subscriber perk. Subscribe to {traderName} to unlock sized copy
                            alerts for every trade they make.
                        </p>
                        <SubscribeButton creatorId={traderId} creatorName={traderName} />
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Per copy (USDC)</span>
                            <input
                                value={perCopy}
                                onChange={(e) => setPerCopy(e.target.value.replace(/[^\d.]/g, ""))}
                                inputMode="decimal"
                                className="h-11 rounded-full border border-flexborder/50 bg-black/25 px-4 text-sm font-bold text-white tabular-nums outline-none focus:border-lantern/50"
                            />
                        </label>
                        <label className="flex flex-col gap-1.5">
                            <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Daily cap (USDC)</span>
                            <input
                                value={dailyCap}
                                onChange={(e) => setDailyCap(e.target.value.replace(/[^\d.]/g, ""))}
                                inputMode="decimal"
                                className="h-11 rounded-full border border-flexborder/50 bg-black/25 px-4 text-sm font-bold text-white tabular-nums outline-none focus:border-lantern/50"
                            />
                        </label>
                        <label className="flex items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3">
                            <span className="text-sm font-semibold text-zinc-300">Paused</span>
                            <Switch checked={paused} onCheckedChange={setPaused} />
                        </label>
                        {autoAvail?.available && status.config && (
                            <div className="flex flex-col gap-2 rounded-2xl bg-white/[0.03] px-4 py-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-semibold text-zinc-300">Hands-free copying</span>
                                    <span className={cn(
                                        "rounded-full px-2.5 py-1 text-[11px] font-bold",
                                        status.config.autoCopyRoleId != null ? "bg-lantern/10 text-lantern" : "bg-white/5 text-zinc-500",
                                    )}>
                                        {status.config.autoCopyRoleId != null ? "ON" : "OFF"}
                                    </span>
                                </div>
                                <p className="text-xs font-medium leading-relaxed text-zinc-500">
                                    Sign once and walk away: copies execute automatically, and your daily USDC cap is
                                    enforced <span className="text-zinc-300">by the chain itself</span> — the executor
                                    key can never spend past it.
                                </p>
                                {status.config.autoCopyRoleId != null ? (
                                    <div className="flex flex-col gap-2">
                                        <button
                                            onClick={updateAutoCap}
                                            disabled={autoBusy || signing}
                                            className="h-10 rounded-full bg-lantern/10 text-xs font-bold text-lantern transition-colors hover:bg-lantern/20"
                                        >
                                            {autoBusy ? "Signing…" : `Update on-chain cap to $${dailyCap}/day`}
                                        </button>
                                        <button
                                            onClick={disableAuto}
                                            disabled={autoBusy || signing}
                                            className="h-10 rounded-full border border-flexborder/50 bg-black/25 text-xs font-bold text-pastelred transition-colors hover:bg-white2/10"
                                        >
                                            {autoBusy ? "Revoking…" : "Disable & revoke on-chain"}
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={enableAuto}
                                        disabled={autoBusy || signing}
                                        className="h-10 rounded-full bg-lantern/90 text-xs font-bold text-zinc-950 transition-colors hover:bg-lantern"
                                    >
                                        {autoBusy ? "Signing…" : `Enable — sign once, cap $${dailyCap}/day on-chain`}
                                    </button>
                                )}
                            </div>
                        )}
                        <p className="text-xs font-medium leading-relaxed text-zinc-500">
                            Without hands-free, you&apos;ll get a push sized to your caps every time {traderName} buys —
                            one tap to execute.
                        </p>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={save}
                                disabled={upsert.isPending}
                                className="h-11 flex-1 rounded-full bg-lantern text-sm font-bold text-zinc-950 transition-colors hover:bg-lantern/90"
                            >
                                {status.config ? "Update" : "Start copying"}
                            </button>
                            {status.config && (
                                <button
                                    onClick={() => remove.mutate({ traderId })}
                                    disabled={remove.isPending}
                                    className="h-11 rounded-full border border-flexborder/50 bg-black/25 px-4 text-sm font-bold text-pastelred transition-colors hover:bg-white2/10"
                                >
                                    Stop
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
