"use client";

import * as React from "react";
import { Megaphone } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";

interface CalloutButtonProps {
    tokenId: string;
    ticker: string;
}

function formatRemaining(ms: number): string {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

/**
 * pump.fun-style callout: notifies all your followers about this token.
 * One per 6h — during cooldown the button shows the remaining time.
 */
export function CalloutButton({ tokenId, ticker }: CalloutButtonProps) {
    const utils = trpc.useUtils();
    const { data: cooldown } = trpc.callout.cooldown.useQuery();
    const [now, setNow] = React.useState(() => Date.now());

    const nextAt = cooldown?.nextAt ? new Date(cooldown.nextAt).getTime() : null;
    const coolingDown = nextAt !== null && nextAt > now;

    React.useEffect(() => {
        if (!coolingDown) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [coolingDown]);

    const create = trpc.callout.create.useMutation({
        onSuccess: ({ notified }) => {
            toast.success(`Called out $${ticker}`, {
                description: notified > 0 ? `${notified} follower${notified === 1 ? "" : "s"} notified` : "It's live in the callouts feed",
            });
            utils.callout.cooldown.invalidate();
            utils.callout.feed.invalidate();
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <button
            onClick={() => create.mutate({ tokenId })}
            disabled={coolingDown || create.isPending}
            title={coolingDown ? "You can call out once every 6 hours" : `Notify your followers about $${ticker}`}
            className={
                coolingDown || create.isPending
                    ? "cursor-default flex items-center gap-2 py-2.5 bg-zinc-800/80 border border-zinc-700/30 text-zinc-500 font-bold rounded-full px-5 text-sm tabular-nums"
                    : "cursor-pointer flex items-center gap-2 py-2.5 bg-lantern text-zinc-950 hover:bg-lantern/90 font-bold rounded-full px-5 text-sm transition-all shadow-md active:scale-95"
            }
        >
            <Megaphone className="size-4" />
            {coolingDown ? formatRemaining(nextAt - now) : create.isPending ? "Calling…" : "Callout"}
        </button>
    );
}
