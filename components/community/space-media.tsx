"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useRealtimeKitClient,
  RealtimeKitProvider,
  useRealtimeKitSelector,
} from "@cloudflare/realtimekit-react";
import type RealtimeKitClient from "@cloudflare/realtimekit";
import type { RTKParticipant } from "@cloudflare/realtimekit";
import { trpc } from "@/lib/trpc/client";
import { SpaceMediaContext, type SpaceMediaStatus } from "./space-media-context";

const EMPTY = new Set<string>();

/**
 * WebRTC audio for a Space (Cloudflare RealtimeKit). Heavy: imports the SFU SDK,
 * so it's loaded via `next/dynamic` (ssr:false) only when a Space is open —
 * keeps the SDK out of every other route's bundle (the speed rule).
 *
 * Flow: fetch an auth token (role-scoped preset) from tRPC → init the client →
 * join. HOST/SPEAKER can toggle their mic; LISTENERs are receive-only. Remount
 * this provider (keyed by role in space-room) to pick up a promotion live.
 */
export function SpaceMediaProvider({
  spaceId,
  children,
}: {
  spaceId: string;
  children: React.ReactNode;
}) {
  const [meeting, initMeeting] = useRealtimeKitClient();
  const [status, setStatus] = useState<SpaceMediaStatus>("connecting");
  const [canSpeak, setCanSpeak] = useState(false);

  const getMediaToken = trpc.spaces.getMediaToken.useMutation();

  // 1. Get a role-scoped token + init the client.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getMediaToken.mutateAsync({ spaceId });
        if (cancelled) return;
        if (!res.enabled) {
          setStatus("disabled");
          return;
        }
        setCanSpeak(res.canSpeak);
        await initMeeting({ authToken: res.authToken });
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId]);

  // 2. Join once the client is ready; leave on unmount.
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

  // Before the client exists, expose a disconnected context so the room renders.
  if (!meeting) {
    return (
      <SpaceMediaContext.Provider
        value={{ status, micEnabled: false, canSpeak, toggleMic: () => {}, speakingUserIds: EMPTY }}
      >
        {children}
      </SpaceMediaContext.Provider>
    );
  }

  return (
    <RealtimeKitProvider value={meeting}>
      {/* Plays remote participants' audio — without this, everyone connects but
          hears nothing (the SDK does not auto-attach remote tracks). */}
      <ParticipantsAudio meeting={meeting} />
      <MediaState meeting={meeting} status={status} canSpeak={canSpeak}>
        {children}
      </MediaState>
    </RealtimeKitProvider>
  );
}

/** Renders a hidden <audio> per joined participant and attaches their track. */
function ParticipantsAudio({ meeting }: { meeting: RealtimeKitClient }) {
  const [, force] = useState(0);
  useEffect(() => {
    const joined = meeting.participants.joined;
    const refresh = () => force((n) => n + 1);
    joined.on("participantJoined", refresh);
    joined.on("participantLeft", refresh);
    joined.on("audioUpdate", refresh);
    return () => {
      joined.off("participantJoined", refresh);
      joined.off("participantLeft", refresh);
      joined.off("audioUpdate", refresh);
    };
  }, [meeting]);

  const participants = [...meeting.participants.joined.values()];
  return (
    <>
      {participants.map((p) => (
        <ParticipantAudio key={p.id} participant={p} />
      ))}
    </>
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

/** Reactive layer: reads self mic + active speakers from the RealtimeKit store. */
function MediaState({
  meeting,
  status,
  canSpeak,
  children,
}: {
  meeting: RealtimeKitClient;
  status: SpaceMediaStatus;
  canSpeak: boolean;
  children: React.ReactNode;
}) {
  const micEnabled = useRealtimeKitSelector((m) => !!m.self.audioEnabled);

  // Stable, comparable slice: sorted userIds of active + unmuted participants.
  const speakingKey = useRealtimeKitSelector((m) => {
    const ids: string[] = [];
    for (const p of m.participants.active.values()) {
      if (p.audioEnabled && p.customParticipantId) ids.push(p.customParticipantId);
    }
    if (m.self.audioEnabled && m.self.customParticipantId) ids.push(m.self.customParticipantId);
    return ids.sort().join(",");
  });

  const speakingUserIds = useMemo(
    () => (speakingKey ? new Set(speakingKey.split(",")) : EMPTY),
    [speakingKey],
  );

  const toggleMic = useCallback(async () => {
    if (!canSpeak) return;
    try {
      if (micEnabled) await meeting.self.disableAudio();
      else await meeting.self.enableAudio();
    } catch {
      /* surfacing failures is a follow-up */
    }
  }, [meeting, canSpeak, micEnabled]);

  return (
    <SpaceMediaContext.Provider value={{ status, micEnabled, canSpeak, toggleMic, speakingUserIds }}>
      {children}
    </SpaceMediaContext.Provider>
  );
}
