"use client";

import * as React from "react";
import { Copy as CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { SubscribeButton } from "@/components/browse/subscribe-button";
import { trpc } from "@/lib/trpc/client";
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md rounded-[25px] border-white/10 bg-[#101011]">
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
                        <p className="text-xs font-medium leading-relaxed text-zinc-500">
                            You&apos;ll get a push sized to your caps every time {traderName} buys — one tap to
                            execute. Hands-free execution ships with on-chain spending caps later.
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
