"use client";

import { useEffect } from "react";
import { ArrowLeft, Mic, MicOff, Hand, Radio, Loader2, PhoneOff } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { getRealtimeClient, authenticateRealtimeClient } from "@/lib/supabase/realtime-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Props = {
    spaceId: string;
    onLeave: () => void;
};

export function SpaceRoom({ spaceId, onLeave }: Props) {
    const { data: session } = useAuthSession();
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.spaces.get.useQuery({ spaceId });

    const leave = trpc.spaces.leave.useMutation({ onSettled: onLeave });
    const end = trpc.spaces.end.useMutation({ onSettled: onLeave });

    // Live roster: refetch on any participant change for this space.
    useEffect(() => {
        if (!session?.user) return;
        let channel: ReturnType<ReturnType<typeof getRealtimeClient>["channel"]> | null = null;
        let cancelled = false;
        (async () => {
            const client = getRealtimeClient();
            try {
                await authenticateRealtimeClient();
            } catch {
                return;
            }
            if (cancelled) return;
            channel = client
                .channel(`space:${spaceId}`)
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "community_space_participants", filter: `space_id=eq.${spaceId}` },
                    () => utils.spaces.get.invalidate({ spaceId })
                )
                .subscribe();
        })();
        return () => {
            cancelled = true;
            if (channel) getRealtimeClient().removeChannel(channel);
        };
    }, [spaceId, session?.user?.id, utils]);

    if (isLoading || !data) {
        return (
            <div className="flex flex-1 items-center justify-center bg-black">
                <Loader2 className="h-7 w-7 text-flexwhite/40 animate-spin" />
            </div>
        );
    }

    const { space, participants } = data;
    const isHost = space.hostId === session?.user?.id;
    const ended = space.status === "ENDED";

    const speakers = participants.filter((p) => p.role === "HOST" || p.role === "SPEAKER");
    const listeners = participants.filter((p) => p.role === "LISTENER");

    return (
        <div className="flex flex-col h-full bg-black">
            {/* top bar */}
            <div className="h-14 shrink-0 px-4 flex items-center gap-3 border-b border-flexwhite/15">
                <button
                    onClick={() => leave.mutate({ spaceId })}
                    className="p-2 -ml-2 rounded-full text-flexwhite/60 hover:text-flexwhite hover:bg-white/5 transition-colors"
                >
                    <ArrowLeft className="size-5" />
                </button>
                <div className="flex items-center gap-2 min-w-0">
                    {!ended && <span className="flex items-center gap-1.5 text-xs font-bold text-darkfantasy"><span className="h-2 w-2 rounded-full bg-darkfantasy animate-pulse" />LIVE</span>}
                    <p className="font-semibold text-flexwhite truncate">{space.title}</p>
                </div>
                <span className="ml-auto text-xs text-flexwhite/40">{participants.length} in room</span>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-6 max-w-3xl mx-auto">
                    {/* audio integration banner */}
                    <div className="rounded-2xl border border-twitter/20 bg-twitter/5 px-4 py-3 mb-8 flex items-center gap-3">
                        <Radio className="size-5 text-twitter shrink-0" />
                        <p className="text-xs text-flexwhite/60">
                            Room & roster are live. Voice audio transport plugs in here next.
                        </p>
                    </div>

                    {/* speakers */}
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-flexwhite/40 mb-4 px-1">
                        Speakers — {speakers.length}
                    </h3>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-5 mb-10">
                        {speakers.map((p) => (
                            <Participant key={p.id} p={p} speaking />
                        ))}
                    </div>

                    {!!listeners.length && (
                        <>
                            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-flexwhite/40 mb-4 px-1">
                                Listeners — {listeners.length}
                            </h3>
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
                                {listeners.map((p) => (
                                    <Participant key={p.id} p={p} />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </ScrollArea>

            {/* control bar */}
            <div className="shrink-0 border-t border-flexwhite/15 px-4 py-3 flex items-center justify-center gap-3">
                <button
                    disabled
                    title="Mic (audio coming soon)"
                    className="h-11 w-11 flex items-center justify-center rounded-full bg-white/5 text-flexwhite/40 cursor-not-allowed"
                >
                    {isHost ? <Mic className="size-5" /> : <MicOff className="size-5" />}
                </button>
                {!isHost && (
                    <button
                        disabled
                        title="Request to speak (coming soon)"
                        className="h-11 px-5 flex items-center gap-2 rounded-full bg-white/5 text-flexwhite/50 font-semibold text-sm cursor-not-allowed"
                    >
                        <Hand className="size-4" /> Request
                    </button>
                )}
                {isHost ? (
                    <button
                        onClick={() => end.mutate({ spaceId })}
                        disabled={end.isPending || ended}
                        className="h-11 px-6 flex items-center gap-2 rounded-full bg-darkfantasy text-white font-semibold text-sm hover:opacity-90 active:scale-95 transition-all disabled:opacity-50"
                    >
                        <PhoneOff className="size-4" /> End Space
                    </button>
                ) : (
                    <button
                        onClick={() => leave.mutate({ spaceId })}
                        disabled={leave.isPending}
                        className="h-11 px-6 flex items-center gap-2 rounded-full bg-white/5 text-flexwhite font-semibold text-sm hover:bg-white/10 active:scale-95 transition-all"
                    >
                        Leave
                    </button>
                )}
            </div>
        </div>
    );
}

function Participant({
    p,
    speaking,
}: {
    p: { userId: string; role: string; name: string | null; username: string | null; avatar_url: string | null };
    speaking?: boolean;
}) {
    return (
        <div className="flex flex-col items-center gap-2 text-center">
            <div className="relative">
                <Avatar className={cn("size-16", speaking && "ring-2 ring-twitter ring-offset-2 ring-offset-black2")}>
                    <AvatarImage src={p.avatar_url ?? undefined} alt={p.name ?? ""} />
                    <AvatarFallback className="bg-zinc-700 text-flexwhite text-lg">
                        {(p.name ?? p.username ?? "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                {p.role === "HOST" && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-twitter text-black2 text-[9px] font-bold uppercase">
                        Host
                    </span>
                )}
            </div>
            <span className="text-xs font-medium text-flexwhite/80 truncate max-w-full">
                {p.name ?? p.username ?? "Unknown"}
            </span>
        </div>
    );
}
