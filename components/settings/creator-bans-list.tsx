"use client";

import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { EmptyState, Panel, PanelSkeleton } from "@/components/settings/ui";

export function CreatorBansList() {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.moderation.getBannedUsers.useQuery();
    const unban = trpc.moderation.unbanUser.useMutation({
        onSuccess: () => { utils.moderation.getBannedUsers.invalidate(); toast.success("User unbanned"); },
    });

    if (isLoading) return <PanelSkeleton rows={3} rowClassName="h-16" />;

    if (!data?.length) return (
        <EmptyState title="No banned users" hint="Ban users from your channel via their profile page" />
    );

    return (
        <Panel className="p-1.5">
            {data.map(u => (
                <div key={u.id} className="flex items-center gap-3 rounded-[18px] px-3.5 py-3 transition-colors hover:bg-white/[0.04]">
                    <Link href={`/${u.username}`}>
                        {u.avatar_url
                            ? <img src={u.avatar_url} className="size-10 rounded-full object-cover" alt={u.name} />
                            : <div className="flex size-10 items-center justify-center rounded-full bg-white/10 font-bold text-zinc-400">{u.name?.[0]}</div>
                        }
                    </Link>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-zinc-200">{u.name}</p>
                        <p className="text-[12px] font-medium text-zinc-500">
                            @{u.username}
                            {u.bannedAt && ` · banned ${formatDistanceToNow(new Date(u.bannedAt))} ago`}
                            {u.reason && ` · ${u.reason}`}
                        </p>
                    </div>
                    <button
                        onClick={() => unban.mutate({ userId: u.id })}
                        disabled={unban.isPending}
                        className="shrink-0 cursor-pointer rounded-full bg-white/5 px-3.5 py-1.5 text-[12px] font-semibold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                    >
                        Unban
                    </button>
                </div>
            ))}
        </Panel>
    );
}
