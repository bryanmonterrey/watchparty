"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
    useRealtimeKitClient,
    RealtimeKitProvider,
    useRealtimeKitSelector,
} from "@cloudflare/realtimekit-react";
import type RealtimeKitClient from "@cloudflare/realtimekit";
import type { RTKParticipant } from "@cloudflare/realtimekit";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Mic01Icon,
    MicOff01Icon,
    Video01Icon,
    VideoOffIcon,
    ComputerIcon,
    CallEnd01Icon,
    AudioWave01Icon,
    MusicNote01Icon,
} from "@hugeicons/core-free-icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

// Voice/video channel room — the Spaces RealtimeKit stack applied to
// persistent channels. Every member can speak; VIDEO channels add camera and
// screenshare. Loaded via next/dynamic (ssr:false) so the SFU SDK ships only
// when someone actually opens a voice channel (the speed rule).

type VoiceStatus = "connecting" | "connected" | "disabled" | "error";

export function VoiceRoom({
    channelId,
    channelName,
    channelType,
    serverId,
    userName,
}: {
    channelId: string;
    channelName: string;
    channelType: "AUDIO" | "VIDEO";
    serverId: string;
    userName: string;
}) {
    const [meeting, initMeeting] = useRealtimeKitClient();
    const [status, setStatus] = useState<VoiceStatus>("connecting");
    const [canVideo, setCanVideo] = useState(false);
    const [inactiveTimeout, setInactiveTimeout] = useState<number | null>(null);

    const getVoiceToken = trpc.community.getVoiceToken.useMutation();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await getVoiceToken.mutateAsync({ channelId });
                if (cancelled) return;
                if (!res.enabled) {
                    setStatus("disabled");
                    return;
                }
                setCanVideo(res.canVideo);
                setInactiveTimeout(res.inactiveTimeoutMinutes);
                await initMeeting({ authToken: res.authToken });
            } catch {
                if (!cancelled) setStatus("error");
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channelId]);

    useEffect(() => {
        if (!meeting) return;
        let active = true;
        meeting
            .join()
            .then(() => active && setStatus("connected"))
            .catch(() => active && setStatus("error"));
        return () => {
            active = false;
            meeting.leave().catch(() => {});
        };
    }, [meeting]);

    if (status === "disabled") {
        return (
            <VoiceShell channelName={channelName}>
                <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
                    <p className="text-[15px] font-bold text-zinc-400">Voice isn&apos;t configured yet</p>
                    <p className="text-[13px] font-medium text-zinc-600">The room works once media is provisioned</p>
                </div>
            </VoiceShell>
        );
    }
    if (status === "error") {
        return (
            <VoiceShell channelName={channelName}>
                <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
                    <p className="text-[15px] font-bold text-zinc-400">Couldn&apos;t connect</p>
                    <p className="text-[13px] font-medium text-zinc-600">Check your mic permissions and try again</p>
                </div>
            </VoiceShell>
        );
    }
    if (!meeting || status === "connecting") {
        return (
            <VoiceShell channelName={channelName}>
                <div className="flex flex-1 items-center justify-center">
                    <div className="h-3.5 w-40 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                </div>
            </VoiceShell>
        );
    }

    return (
        <RealtimeKitProvider value={meeting}>
            <ConnectedRoom
                meeting={meeting}
                channelName={channelName}
                channelType={channelType}
                serverId={serverId}
                userName={userName}
                canVideo={canVideo}
                inactiveTimeoutMinutes={inactiveTimeout}
            />
        </RealtimeKitProvider>
    );
}

function VoiceShell({ channelName, children }: { channelName: string; children: React.ReactNode }) {
    return (
        <div className="flex h-full min-w-0 flex-col">
            <div className="h-17 shrink-0 flex items-center gap-2 bg-black/50 backdrop-blur-xl px-4">
                <span className="font-semibold text-lg text-flexwhite">{channelName}</span>
            </div>
            {children}
        </div>
    );
}

function ConnectedRoom({
    meeting,
    channelName,
    channelType,
    serverId,
    userName,
    canVideo,
    inactiveTimeoutMinutes,
}: {
    meeting: RealtimeKitClient;
    channelName: string;
    channelType: "AUDIO" | "VIDEO";
    serverId: string;
    userName: string;
    canVideo: boolean;
    inactiveTimeoutMinutes: number | null;
}) {
    const router = useRouter();
    const micEnabled = useRealtimeKitSelector((m) => !!m.self.audioEnabled);
    const videoEnabled = useRealtimeKitSelector((m) => !!m.self.videoEnabled);
    const screenShareEnabled = useRealtimeKitSelector((m) => !!m.self.screenShareEnabled);

    const [, force] = useState(0);
    useEffect(() => {
        const joined = meeting.participants.joined;
        const refresh = () => force((n) => n + 1);
        const events = ["participantJoined", "participantLeft", "audioUpdate", "videoUpdate", "screenShareUpdate"] as const;
        for (const e of events) joined.on(e, refresh);
        return () => {
            for (const e of events) joined.off(e, refresh);
        };
    }, [meeting]);

    const leave = useCallback(() => {
        router.push(`/communities/${serverId}`);
    }, [router, serverId]);

    // Voice AFK: silent + no media for the configured window → auto-leave.
    // Cheap client-side version of Discord's inactive-channel move.
    // 0 = not stamped yet; the watchdog stamps join time on its first tick.
    const lastActiveRef = useRef(0);
    useEffect(() => {
        if (micEnabled || videoEnabled || screenShareEnabled) lastActiveRef.current = Date.now();
    }, [micEnabled, videoEnabled, screenShareEnabled]);
    useEffect(() => {
        if (!inactiveTimeoutMinutes) return;
        if (!lastActiveRef.current) lastActiveRef.current = Date.now();
        const t = setInterval(() => {
            if (Date.now() - lastActiveRef.current > inactiveTimeoutMinutes * 60 * 1000) {
                leave();
            }
        }, 30_000);
        return () => clearInterval(t);
    }, [inactiveTimeoutMinutes, leave]);

    // ── Soundboard ────────────────────────────────────────
    // Plays are broadcast over the meeting's data channel; every client plays
    // the clip locally from its OWN sound list (payload carries only the sound
    // id, so a hand-rolled broadcast can't make peers fetch arbitrary URLs).
    const [soundboardOpen, setSoundboardOpen] = useState(false);
    const [nowPlaying, setNowPlaying] = useState<{ by: string; label: string } | null>(null);
    const { data: sounds = [] } = trpc.community.listSounds.useQuery({ serverId });
    const soundsRef = useRef(sounds);
    soundsRef.current = sounds;

    const playClip = useCallback((url: string) => {
        const el = new Audio(url);
        el.volume = 0.6;
        el.play().catch(() => {});
    }, []);

    const fireSound = (sound: { id: string; name: string; emoji: string | null; audioUrl: string }) => {
        playClip(sound.audioUrl);
        setNowPlaying({ by: "you", label: sound.emoji ?? sound.name });
        meeting.participants
            .broadcastMessage("soundboard", { soundId: sound.id, peerId: meeting.self.id, senderName: userName })
            .catch(() => {});
    };

    useEffect(() => {
        const onBroadcast = ({ type, payload }: { type: string; payload: Record<string, unknown> }) => {
            if (type !== "soundboard") return;
            if (payload.peerId === meeting.self.id) return; // we already played it on click
            const sound = soundsRef.current.find((s) => s.id === payload.soundId);
            if (!sound) return;
            playClip(sound.audioUrl);
            setNowPlaying({ by: String(payload.senderName ?? "someone"), label: sound.emoji ?? sound.name });
        };
        meeting.participants.on("broadcastedMessage", onBroadcast);
        return () => {
            meeting.participants.off("broadcastedMessage", onBroadcast);
        };
    }, [meeting, playClip]);

    useEffect(() => {
        if (!nowPlaying) return;
        const t = setTimeout(() => setNowPlaying(null), 3000);
        return () => clearTimeout(t);
    }, [nowPlaying]);

    const toggleMic = () => (micEnabled ? meeting.self.disableAudio() : meeting.self.enableAudio()).catch(() => {});
    const toggleVideo = () => (videoEnabled ? meeting.self.disableVideo() : meeting.self.enableVideo()).catch(() => {});
    const toggleScreenShare = () =>
        (screenShareEnabled ? meeting.self.disableScreenShare() : meeting.self.enableScreenShare()).catch(() => {});

    const participants = [...meeting.participants.joined.values()];
    const tiles: { key: string; name: string; participant: RTKParticipant | null }[] = [
        { key: "self", name: `${userName} (you)`, participant: null },
        ...participants.map((p) => ({ key: p.id, name: p.name ?? "Guest", participant: p })),
    ];

    // Screenshares get the stage; camera/avatar tiles form the grid below.
    const sharing = participants.filter((p) => p.screenShareEnabled);
    const selfSharing = screenShareEnabled;

    return (
        <div className="flex h-full min-w-0 flex-col">
            <div className="h-17 shrink-0 flex items-center gap-2 bg-black/50 backdrop-blur-xl px-4">
                <span className="font-semibold text-lg text-flexwhite">{channelName}</span>
                <span className="rounded-full bg-lantern/15 px-2 py-0.5 text-[11px] font-bold text-lantern">
                    {tiles.length} in voice
                </span>
                {nowPlaying && (
                    <span className="flex items-center gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-bold text-zinc-300">
                        <HugeiconsIcon icon={AudioWave01Icon} className="size-3.5 text-lantern" strokeWidth={2.5} />
                        {nowPlaying.by} played {nowPlaying.label}
                    </span>
                )}
            </div>

            {/* Remote audio */}
            {participants.map((p) => (
                <ParticipantAudio key={`audio-${p.id}`} participant={p} />
            ))}

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                {/* Screenshare stage */}
                {(sharing.length > 0 || selfSharing) && (
                    <div className="grid shrink-0 gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(2, sharing.length + (selfSharing ? 1 : 0))}, minmax(0, 1fr))` }}>
                        {selfSharing && <ScreenTile track={meeting.self.screenShareTracks?.video ?? null} label={`${userName} (you)`} />}
                        {sharing.map((p) => (
                            <ScreenTile key={`share-${p.id}`} track={p.screenShareTracks?.video ?? null} label={p.name ?? "Guest"} />
                        ))}
                    </div>
                )}

                {/* Participant grid */}
                <div className="grid flex-1 content-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
                    <SelfTile meeting={meeting} name={`${userName} (you)`} />
                    {participants.map((p) => (
                        <ParticipantTile key={p.id} participant={p} />
                    ))}
                </div>
            </div>

            {/* Soundboard panel — sits above the control bar */}
            {soundboardOpen && (
                <div className="mx-auto mb-2 w-full max-w-md shrink-0 rounded-3xl bg-white/[0.04] p-3">
                    {sounds.length === 0 ? (
                        <p className="py-4 text-center text-[13px] font-medium text-zinc-500">
                            No sounds yet — add some in Server Settings → Soundboard
                        </p>
                    ) : (
                        <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto">
                            {sounds.map((s) => (
                                <button
                                    key={s.id}
                                    onClick={() => fireSound(s)}
                                    title={s.name}
                                    className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl bg-white/[0.04] px-1 py-2.5 transition-colors hover:bg-white/[0.09]"
                                >
                                    {s.emoji ? (
                                        <span className="text-[20px] leading-none">{s.emoji}</span>
                                    ) : (
                                        <HugeiconsIcon icon={AudioWave01Icon} className="size-5 text-zinc-300" strokeWidth={2} />
                                    )}
                                    <span className="w-full truncate text-[11px] font-bold text-zinc-400">{s.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Control bar — clustered center-left, away from the app header */}
            <div className="flex shrink-0 items-center justify-center gap-2 pb-5 pt-1">
                <ControlButton
                    active={soundboardOpen}
                    onClick={() => setSoundboardOpen((v) => !v)}
                    label={soundboardOpen ? "Close soundboard" : "Soundboard"}
                    icon={MusicNote01Icon}
                />
                <ControlButton
                    active={micEnabled}
                    onClick={toggleMic}
                    label={micEnabled ? "Mute" : "Unmute"}
                    icon={micEnabled ? Mic01Icon : MicOff01Icon}
                />
                {canVideo && channelType === "VIDEO" && (
                    <ControlButton
                        active={videoEnabled}
                        onClick={toggleVideo}
                        label={videoEnabled ? "Camera off" : "Camera on"}
                        icon={videoEnabled ? Video01Icon : VideoOffIcon}
                    />
                )}
                {canVideo && (
                    <ControlButton
                        active={screenShareEnabled}
                        onClick={toggleScreenShare}
                        label={screenShareEnabled ? "Stop sharing" : "Share screen"}
                        icon={ComputerIcon}
                    />
                )}
                <button
                    onClick={leave}
                    aria-label="Leave voice"
                    className="grid size-12 cursor-pointer place-items-center rounded-full bg-pastelred/20 text-pastelred transition-colors hover:bg-pastelred/30"
                >
                    <HugeiconsIcon icon={CallEnd01Icon} className="size-5" strokeWidth={2} />
                </button>
            </div>
        </div>
    );
}

function ControlButton({
    active,
    onClick,
    label,
    icon,
}: {
    active: boolean;
    onClick: () => void;
    label: string;
    icon: typeof Mic01Icon;
}) {
    return (
        <button
            onClick={onClick}
            aria-label={label}
            title={label}
            className={cn(
                "grid size-12 cursor-pointer place-items-center rounded-full transition-colors",
                active ? "bg-white text-black hover:bg-white/90" : "bg-white/10 text-white hover:bg-white/20",
            )}
        >
            <HugeiconsIcon icon={icon} className="size-5" strokeWidth={2} />
        </button>
    );
}

function ParticipantAudio({ participant }: { participant: RTKParticipant }) {
    const ref = useRef<HTMLAudioElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        if (participant.audioEnabled && participant.audioTrack) {
            el.srcObject = new MediaStream([participant.audioTrack]);
            el.play().catch(() => {});
        } else {
            el.srcObject = null;
        }
    }, [participant.audioEnabled, participant.audioTrack]);
    return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

function VideoSurface({ track, mirror = false }: { track: MediaStreamTrack | null; mirror?: boolean }) {
    const ref = useRef<HTMLVideoElement>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.srcObject = track ? new MediaStream([track]) : null;
        if (track) el.play().catch(() => {});
    }, [track]);
    return (
        <video
            ref={ref}
            autoPlay
            playsInline
            muted
            className={cn("size-full object-cover", mirror && "scale-x-[-1]")}
        />
    );
}

function TileFrame({ name, speaking, children }: { name: string; speaking?: boolean; children: React.ReactNode }) {
    return (
        <div
            className={cn(
                "relative aspect-video overflow-hidden rounded-3xl bg-white/[0.04] transition-shadow",
                speaking && "shadow-[0_0_0_2px_var(--color-lantern)]",
            )}
        >
            {children}
            <span className="absolute bottom-2 left-2 max-w-[85%] truncate rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-bold text-white">
                {name}
            </span>
        </div>
    );
}

function SelfTile({ meeting, name }: { meeting: RealtimeKitClient; name: string }) {
    const videoEnabled = useRealtimeKitSelector((m) => !!m.self.videoEnabled);
    const audioEnabled = useRealtimeKitSelector((m) => !!m.self.audioEnabled);
    const videoTrack = useRealtimeKitSelector((m) => m.self.videoTrack ?? null);
    const picture = meeting.self.picture;

    return (
        <TileFrame name={name} speaking={audioEnabled}>
            {videoEnabled && videoTrack ? (
                <VideoSurface track={videoTrack} mirror />
            ) : (
                <CenterAvatar name={name} picture={picture} />
            )}
        </TileFrame>
    );
}

function ParticipantTile({ participant }: { participant: RTKParticipant }) {
    return (
        <TileFrame name={participant.name ?? "Guest"} speaking={participant.audioEnabled}>
            {participant.videoEnabled && participant.videoTrack ? (
                <VideoSurface track={participant.videoTrack} />
            ) : (
                <CenterAvatar name={participant.name ?? "Guest"} picture={participant.picture} />
            )}
        </TileFrame>
    );
}

function CenterAvatar({ name, picture }: { name: string; picture?: string | null }) {
    return (
        <div className="grid size-full place-items-center">
            <Avatar className="size-16">
                <AvatarImage src={picture || undefined} alt={name} />
                <AvatarFallback className="bg-white/10 text-[18px] font-bold text-zinc-300">
                    {name.charAt(0).toUpperCase()}
                </AvatarFallback>
            </Avatar>
        </div>
    );
}

function ScreenTile({ track, label }: { track: MediaStreamTrack | null; label: string }) {
    return (
        <div className="relative aspect-video overflow-hidden rounded-3xl bg-black">
            <VideoSurface track={track} />
            <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-bold text-white">
                {label} — screen
            </span>
        </div>
    );
}
