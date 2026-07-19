"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc/client";

// Standing copy configs — shown above the Top Traders board (that's where
// copy-minded users already are). Pause flips inline; caps edit lives in the
// trader-profile dialog.
function statusChip(status: string) {
    if (status === "executed") return "bg-lantern/10 text-lantern";
    if (status === "failed") return "bg-pastelred/10 text-pastelred";
    return "bg-white/5 text-zinc-500";
}

function RecentCopies() {
    const { data } = trpc.copy.orders.useQuery({ limit: 10 }, { refetchInterval: 60_000 });
    if (!data || data.orders.length === 0) return null;
    return (
        <div className="flex flex-col gap-2">
            <p className="px-1 text-xs font-bold uppercase tracking-wider text-zinc-500">Recent copies</p>
            {data.orders.map((o) => (
                <div key={o.id} className="flex items-center gap-3 rounded-[20px] bg-panel px-4 py-2.5">
                    <span className="truncate text-sm font-bold text-white">{o.trader.name}</span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${statusChip(o.status)}`}>
                        {o.status}
                    </span>
                    {o.reason && <span className="truncate text-xs font-medium text-zinc-500">{o.reason}</span>}
                    <span className="ml-auto shrink-0 text-sm font-bold text-white tabular-nums">
                        {o.usdSize > 0 ? `$${Math.round(o.usdSize).toLocaleString()}` : "—"}
                    </span>
                </div>
            ))}
        </div>
    );
}

export function MyCopies() {
    const utils = trpc.useUtils();
    const { data } = trpc.copy.mine.useQuery();
    const upsert = trpc.copy.upsert.useMutation({
        onSuccess: () => utils.copy.mine.invalidate(),
        onError: (e) => toast.error(e.message),
    });

    if (!data || data.copies.length === 0) return null;

    return (
        <div className="mb-2 flex flex-col gap-2">
            <p className="px-1 text-xs font-bold uppercase tracking-wider text-zinc-500">Copying</p>
            {data.copies.map((c) => (
                <div key={c.traderId} className="flex items-center gap-3 rounded-[20px] bg-panel px-4 py-3">
                    <Link href={`/${c.trader.username ?? ""}`} className="flex items-center gap-2.5 min-w-0 group">
                        <Avatar className="size-8 border border-zinc-700/50">
                            <AvatarImage src={c.trader.avatar_url || undefined} />
                            <AvatarFallback className="bg-zinc-800" />
                        </Avatar>
                        <span className="truncate text-sm font-bold text-white group-hover:underline">{c.trader.name}</span>
                    </Link>
                    <span className="text-xs font-semibold text-zinc-500 tabular-nums">
                        ${c.maxUsdcPerCopy}/copy · ${c.dailyUsdcCap}/day
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-500">{c.paused ? "Paused" : "Active"}</span>
                        <Switch
                            checked={!c.paused}
                            onCheckedChange={(on) => upsert.mutate({
                                traderId: c.traderId,
                                maxUsdcPerCopy: c.maxUsdcPerCopy,
                                dailyUsdcCap: c.dailyUsdcCap,
                                paused: !on,
                            })}
                        />
                    </div>
                </div>
            ))}
            <RecentCopies />
        </div>
    );
}
