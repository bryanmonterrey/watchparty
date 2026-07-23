"use client";

import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { EmptyState, Panel, PanelSkeleton } from "@/components/settings/ui";

export function BlockedList() {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.moderation.getBlocked.useQuery();
    const unblock = trpc.moderation.unblock.useMutation({
        onSuccess: () => { utils.moderation.getBlocked.invalidate(); toast.success("Unblocked"); },
    });

    if (isLoading) return <PanelSkeleton rows={3} rowClassName="h-16" />;

    if (!data?.length) return (
        <EmptyState title="No blocked users" hint="People you block show up here" />
    );

    return (
        <Panel className="p-1.5">
            {data.map(u => (
                <div key={u.id} className="flex items-center gap-3 rounded-[18px] px-3.5 py-3 transition-colors hover:bg-white/[0.04]">
                    <Link href={`/${u.username}`}>
                        {u.avatar_url
                            ? <img src={u.avatar_url} className="size-10 rounded-full object-cover" />
                            : <img src="/avatar.png" alt="" className="size-10 rounded-full object-cover" />
                        }
                    </Link>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-zinc-200">{u.name}</p>
                        <p className="text-[12px] font-medium text-zinc-500">@{u.username} · blocked {formatDistanceToNow(new Date(u.blockedAt))} ago</p>
                    </div>
                    <button
                        onClick={() => unblock.mutate({ userId: u.id })}
                        disabled={unblock.isPending}
                        className="shrink-0 cursor-pointer rounded-full bg-white/5 px-3.5 py-1.5 text-[12px] font-semibold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                    >
                        Unblock
                    </button>
                </div>
            ))}
        </Panel>
    );
}
