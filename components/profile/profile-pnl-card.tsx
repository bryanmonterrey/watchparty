"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { cn } from "@/lib/utils";

// Trading PnL card (docs/exp-callouts.md §4c). Hidden unless the user shares
// trades — except on your own profile, where it prompts you to opt in.
// Realized-only by design (see server/lib/pnl.ts).

function fmtUsd(v: number): string {
    const sign = v < 0 ? "-" : "+";
    const abs = Math.abs(v);
    const s = abs >= 1000 ? `${(abs / 1000).toFixed(1)}K` : abs.toFixed(abs >= 10 ? 0 : 2);
    return `${sign}$${s}`;
}

export function ProfilePnlCard({ userId }: { userId: string }) {
    const { data: session } = useAuthSession();
    const isOwner = session?.user?.id === userId;
    const utils = trpc.useUtils();
    const { data } = trpc.pnl.forUser.useQuery({ userId });
    const setSharing = trpc.pnl.setSharing.useMutation({
        onSuccess: ({ shareTrades }) => {
            toast.success(shareTrades ? "Your trades are now public" : "Your trades are private again");
            utils.pnl.forUser.invalidate({ userId });
        },
        onError: (e) => toast.error(e.message),
    });

    if (!data?.visible) return null;

    const w7 = data.windows.find((w) => w.window === "7d");
    const realized = w7?.realizedUsd ?? 0;

    return (
        <div className="mt-2 flex max-w-2xl items-center gap-5 rounded-[20px] bg-panel px-5 py-3.5">
            <div className="flex items-center gap-2 shrink-0">
                <TrendingUp className="size-4 text-lantern2" />
                <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">7d PnL</span>
            </div>
            <span className={cn("text-lg font-black tabular-nums", realized >= 0 ? "text-lantern" : "text-pastelred")}>
                {fmtUsd(realized)}
            </span>
            <div className="hidden sm:flex items-center gap-4 text-xs font-semibold text-zinc-400 tabular-nums">
                <span>{w7?.tradeCount ?? 0} trades</span>
                <span>{w7?.winRate != null ? `${Math.round(w7.winRate * 100)}% wins` : "— wins"}</span>
                <span>${Math.round(w7?.volumeUsd ?? 0).toLocaleString()} vol</span>
            </div>
            {isOwner && (
                <button
                    onClick={() => setSharing.mutate({ share: !data.shareTrades })}
                    disabled={setSharing.isPending}
                    className={cn(
                        "ml-auto shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors",
                        data.shareTrades
                            ? "bg-lantern/10 text-lantern hover:bg-lantern/20"
                            : "border border-flexborder/50 bg-black/25 text-zinc-300 hover:bg-white2/10",
                    )}
                >
                    {data.shareTrades ? "Trades public" : "Share trades"}
                </button>
            )}
        </div>
    );
}
