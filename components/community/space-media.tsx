"use client";

import { useCallback, useEffect, useState } from "react";
import { useRealtimeKitClient } from "@cloudflare/realtimekit-react";
import { trpc } from "@/lib/trpc/client";
import { SpaceMediaContext, type SpaceMediaStatus } from "./space-media-context";

/**
 * WebRTC audio for a Space (Cloudflare RealtimeKit). Heavy: imports the SFU SDK,
 * so it's loaded via `next/dynamic` (ssr:false) only when a Space is open —
 * keeps the SDK out of every other route's bundle (the speed rule).
 *
 * Flow: fetch an auth token (role-scoped preset) from tRPC → init the client →
 * join the room. HOST/SPEAKER can toggle their mic; LISTENERs are receive-only.
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
  const [micEnabled, setMicEnabled] = useState(false);

  const getMediaToken = trpc.spaces.getMediaToken.useMutation();

  // 1. Get a token + init the client.
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

  // 2. Join the room once the client is ready; leave on unmount.
  useEffect(() => {
    if (!meeting) return;
    let active = true;
    meeting
      .join()
      .then(() => {
        if (!active) return;
        setStatus("connected");
        try {
          setMicEnabled(!!meeting.self.audioEnabled);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
      meeting.leave().catch(() => {});
    };
  }, [meeting]);

  const toggleMic = useCallback(async () => {
    if (!meeting || !canSpeak) return;
    try {
      if (micEnabled) {
        await meeting.self.disableAudio();
        setMicEnabled(false);
      } else {
        await meeting.self.enableAudio();
        setMicEnabled(true);
      }
    } catch {
      /* surfacing failures is a follow-up */
    }
  }, [meeting, canSpeak, micEnabled]);

  return (
    <SpaceMediaContext.Provider value={{ status, micEnabled, canSpeak, toggleMic }}>
      {children}
    </SpaceMediaContext.Provider>
  );
}
