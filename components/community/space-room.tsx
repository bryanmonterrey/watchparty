"use client";

import dynamic from "next/dynamic";
import { ArrowLeft, Mic, MicOff, Hand, Radio, PhoneOff } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { useAuthSession } from "@/hooks/use-auth-session";
import { useRealtimeRoom } from "@/hooks/use-realtime-room";
import { rooms, type ServerEvent } from "@/lib/realtime/protocol";
import { useSpaceMedia } from "./space-media-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Heavy WebRTC SDK — load only when a Space is open (speed rule). Inline options
// literal required by Turbopack.
const SpaceMediaProvider = dynamic(
    () => import("./space-media").then((m) => m.SpaceMediaProvider),
    { ssr: false },
);

type Props = {
    spaceId: string;
    onLeave: () => void;
};

export function SpaceRoom({ spaceId, onLeave }: Props) {
    const { data: session } = useAuthSession();
    const utils = trpc.useUtils();
    // Realtime roster-change is the fast path; this is only the safety net for a
    // missed WS event.
    //
    // It was 5s, chosen when server->client realtime was silently dead: every
    // publish went to `community-channel%3A<id>` while clients sat in
    // `community-channel:<id>`, so the poll WAS the transport (see Phase 10 in
    // docs/buzz-adoption-plan.md). That routing bug is fixed, so a 12x/minute
    // poll per participant is now paying for a path that already works —
    // pure amplification of exactly the kind that saturated the container.
    //
    // 30s keeps the net (a dropped event still self-heals well inside a
    // conversation) at a sixth of the cost, and every local action already
    // invalidates immediately via `refetchRoster`, so the actor never waits for
    // it. Widen further only with a measurement, not a guess.
    const { data, isLoading } = trpc.spaces.get.useQuery(
        { spaceId },
        { refetchInterval: 30_000, refetchOnWindowFocus: true },
    );

    // Refetch immediately after my own action so the actor sees instant feedback
    // (don't wait for the round-trip realtime event).
    const refetchRoster = () => utils.spaces.get.invalidate({ spaceId });
    const leave = trpc.spaces.leave.useMutation({ onSettled: onLeave });
    const end = trpc.spaces.end.useMutation({ onSettled: onLeave });
    const setRole = trpc.spaces.setRole.useMutation({ onSuccess: refetchRoster });
    const requestToSpeak = trpc.spaces.requestToSpeak.useMutation({ onSuccess: refetchRoster });

    // Live roster: refetch when the space router publishes a roster/status change.
    useRealtimeRoom(spaceId ? rooms.space(spaceId) : null, {
        enabled: !!session?.user,
        onEvent: (e: ServerEvent) => {
            if (e.t === "event" && e.name === "roster-change") {
                utils.spaces.get.invalidate({ spaceId });
            }
        },
    });

    if (isLoading || !data) {
        return (
            <div className="flex flex-1 flex-col gap-6 bg-background p-6">
                <div className="h-8 w-48 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                <div className="grid grid-cols-4 gap-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="flex flex-col items-center gap-2">
                            <div className="size-16 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                            <div className="h-3 w-14 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const { space, participants } = data;
    const isHost = space.hostId === session?.user?.id;
    const ended = space.status === "ENDED";
    // Keying the media provider by the caller's role makes a host promotion
    // (LISTENER → SPEAKER, delivered via DO roster-change) remount it with a
    // fresh speaker-preset token — i.e. go live without a manual refresh.
    const me = participants.find((p) => p.userId === session?.user?.id);
    const myRole = me?.role ?? "LISTENER";
    const myHandRaised = !!me?.handRaised;

    const speakers = participants.filter((p) => p.role === "HOST" || p.role === "SPEAKER");
    // Hand-raised listeners float to the top so the host sees requests first.
    const listeners = participants
        .filter((p) => p.role === "LISTENER")
        .sort((a, b) => Number(!!b.handRaised) - Number(!!a.handRaised));
    const pendingRequests = isHost ? listeners.filter((p) => p.handRaised).length : 0;

    const inviteUp = (userId: string) => setRole.mutate({ spaceId, userId, role: "SPEAKER" });
    const moveDown = (userId: string) => setRole.mutate({ spaceId, userId, role: "LISTENER" });

    return (
        <SpaceMediaProvider key={myRole} spaceId={spaceId}>
        <div className="flex flex-col h-full bg-background">
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
                    {/* live audio status */}
                    <SpaceAudioBanner />

                    {/* speakers */}
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-flexwhite/40 mb-4 px-1">
                        Speakers — {speakers.length}
                    </h3>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-5 mb-10">
                        {speakers.map((p) => (
                            <Participant
                                key={p.id}
                                p={p}
                                canManage={isHost && p.role !== "HOST"}
                                onDemote={() => moveDown(p.userId)}
                            />
                        ))}
                    </div>

                    {!!listeners.length && (
                        <>
                            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-flexwhite/40 mb-4 px-1">
                                Listeners — {listeners.length}
                                {pendingRequests > 0 && (
                                    <span className="ml-2 text-darkfantasy">· {pendingRequests} want to speak</span>
                                )}
                            </h3>
                            <div className="grid grid-cols-4 sm:grid-cols-6 gap-4">
                                {listeners.map((p) => (
                                    <Participant
                                        key={p.id}
                                        p={p}
                                        canManage={isHost}
                                        onInvite={() => inviteUp(p.userId)}
                                    />
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </ScrollArea>

            {/* control bar */}
            <div className="shrink-0 border-t border-flexwhite/15 px-4 py-3 flex items-center justify-center gap-3">
                <SpaceMicButton />
                {!isHost && myRole === "LISTENER" && (
                    <button
                        onClick={() => requestToSpeak.mutate({ spaceId, raised: !myHandRaised })}
                        disabled={requestToSpeak.isPending || ended}
                        title={myHandRaised ? "Cancel your request" : "Ask the host to let you speak"}
                        className={cn(
                            "h-11 px-5 flex items-center gap-2 rounded-full font-semibold text-sm transition-all active:scale-95 disabled:opacity-50",
                            myHandRaised
                                ? "bg-darkfantasy/20 text-darkfantasy"
                                : "bg-white/10 text-flexwhite hover:bg-white/15",
                        )}
                    >
                        <Hand className="size-4" /> {myHandRaised ? "Requested" : "Request"}
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
        </SpaceMediaProvider>
    );
}

/** Live audio connection status banner. Inside SpaceMediaProvider. */
function SpaceAudioBanner() {
    const { status } = useSpaceMedia();
    const label =
        status === "connected"
            ? "Live audio connected."
            : status === "connecting"
            ? "Connecting to live audio…"
            : status === "disabled"
            ? "Room & roster are live. Voice audio isn't configured on this deployment yet."
            : "Couldn't connect to live audio — roster + controls still work.";
    return (
        <div className="rounded-2xl border border-twitter/20 bg-twitter/5 px-4 py-3 mb-8 flex items-center gap-3">
            <Radio className={cn("size-5 shrink-0", status === "connected" ? "text-twitter" : "text-flexwhite/50")} />
            <p className="text-xs text-flexwhite/60">{label}</p>
        </div>
    );
}

/** Mic toggle wired to live WebRTC audio (RealtimeKit). Inside SpaceMediaProvider. */
function SpaceMicButton() {
    const { status, micEnabled, canSpeak, toggleMic } = useSpaceMedia();
    const ready = status === "connected";
    const usable = canSpeak && ready;
    return (
        <button
            onClick={toggleMic}
            disabled={!usable}
            title={
                !canSpeak
                    ? "Listeners can't speak — ask the host to invite you up"
                    : !ready
                    ? "Connecting audio…"
                    : micEnabled
                    ? "Mute"
                    : "Unmute"
            }
            className={cn(
                "h-11 w-11 flex items-center justify-center rounded-full transition-colors",
                usable
                    ? micEnabled
                        ? "bg-twitter text-white hover:opacity-90"
                        : "bg-white/10 text-flexwhite hover:bg-white/15"
                    : "bg-white/5 text-flexwhite/40 cursor-not-allowed",
            )}
        >
            {micEnabled ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </button>
    );
}

function Participant({
    p,
    canManage = false,
    onInvite,
    onDemote,
}: {
    p: { userId: string; role: string; handRaised?: boolean; name: string | null; username: string | null; avatar_url: string | null };
    canManage?: boolean;
    onInvite?: () => void;
    onDemote?: () => void;
}) {
    const { speakingUserIds } = useSpaceMedia();
    const speaking = speakingUserIds.has(p.userId);
    const isListener = p.role === "LISTENER";
    return (
        <div className="flex flex-col items-center gap-2 text-center">
            <div className="relative">
                <Avatar className={cn("size-16", speaking && "ring-2 ring-twitter ring-offset-2 ring-offset-black")}>
                    <AvatarImage src={p.avatar_url ?? undefined} alt={p.name ?? ""} />
                    <AvatarFallback className="bg-zinc-700 text-flexwhite text-lg">
                    </AvatarFallback>
                </Avatar>
                {p.role === "HOST" && (
                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-twitter text-black text-[9px] font-bold uppercase">
                        Host
                    </span>
                )}
                {isListener && p.handRaised && (
                    <span className="absolute -top-1 -right-1 grid place-items-center size-5 rounded-full bg-darkfantasy text-white">
                        <Hand className="size-3" />
                    </span>
                )}
            </div>
            <span className="text-xs font-medium text-flexwhite/80 truncate max-w-full">
                {p.name ?? p.username ?? ""}
            </span>
            {canManage && isListener && onInvite && (
                <button
                    onClick={onInvite}
                    className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold transition-colors",
                        p.handRaised
                            ? "bg-darkfantasy text-white hover:opacity-90"
                            : "bg-white/10 text-flexwhite/80 hover:bg-white/20",
                    )}
                >
                    Invite up
                </button>
            )}
            {canManage && !isListener && onDemote && (
                <button
                    onClick={onDemote}
                    className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-flexwhite/60 hover:bg-white/20 transition-colors"
                >
                    Move down
                </button>
            )}
        </div>
    );
}
