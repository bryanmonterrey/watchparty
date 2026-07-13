"use client";

import { trpc } from "@/lib/trpc/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { EmptyState, Panel, PanelSkeleton } from "@/components/settings/ui";

export function MutedList() {
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.moderation.getMuted.useQuery();
    const unmute = trpc.moderation.unmute.useMutation({
        onSuccess: () => { utils.moderation.getMuted.invalidate(); toast.success("Unmuted"); },
    });

    if (isLoading) return <PanelSkeleton rows={3} rowClassName="h-16" />;

    if (!data?.length) return (
        <EmptyState title="No muted users" hint="Mute someone from their profile to quiet them without unfollowing" />
    );

    return (
        <Panel className="p-1.5">
            {data.map(u => (
                <div key={u.id} className="flex items-center gap-3 rounded-[18px] px-3.5 py-3 transition-colors hover:bg-white/[0.04]">
                    <Link href={`/${u.username}`}>
                        {u.avatar_url
                            ? <img src={u.avatar_url} className="size-10 rounded-full object-cover" />
                            : <div className="flex size-10 items-center justify-center rounded-full bg-white/10 font-bold text-zinc-400">{u.name?.[0]}</div>
                        }
                    </Link>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-zinc-200">{u.name}</p>
                        <p className="text-[12px] font-medium text-zinc-500">
                            @{u.username} · muted {formatDistanceToNow(new Date(u.mutedAt))} ago
                        </p>
                        <div className="mt-0.5 flex gap-1.5">
                            {u.muteNotifications && <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500">Notifications</span>}
                            {u.muteStories && <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500">Stories</span>}
                        </div>
                    </div>
                    <button
                        onClick={() => unmute.mutate({ userId: u.id })}
                        disabled={unmute.isPending}
                        className="shrink-0 cursor-pointer rounded-full bg-white/5 px-3.5 py-1.5 text-[12px] font-semibold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                    >
                        Unmute
                    </button>
                </div>
            ))}
        </Panel>
    );
}
