"use client";

import { useCallback, useEffect, useRef } from "react";
import type PartySocket from "partysocket";
import { createRoomSocket, isRealtimeEnabled } from "@/lib/realtime/client";
import { parseServerEvent, type ClientMessage, type ServerEvent } from "@/lib/realtime/protocol";

type Options = {
  /** Skip connecting (e.g. before ids are known). Default true. */
  enabled?: boolean;
  /** Called for every event pushed by the room. */
  onEvent?: (event: ServerEvent) => void;
  /** Called when the socket opens (true) or closes (false). */
  onStatus?: (connected: boolean) => void;
};

/**
 * Low-level hook: manage one PartySocket room connection, parse incoming
 * `ServerEvent`s, and expose a typed `send` for `ClientMessage`s. Higher-level
 * hooks (community, DMs, spaces) build presence/typing logic on top of this.
 */
export function useRealtimeRoom(room: string | null | undefined, opts: Options = {}) {
  const { enabled = true } = opts;
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;
  const onStatusRef = useRef(opts.onStatus);
  onStatusRef.current = opts.onStatus;

  const socketRef = useRef<PartySocket | null>(null);

  useEffect(() => {
    if (!room || !enabled || !isRealtimeEnabled()) return;

    const socket = createRoomSocket(room);
    socketRef.current = socket;

    const onMessage = (ev: MessageEvent) => {
      if (typeof ev.data !== "string") return;
      const parsed = parseServerEvent(ev.data);
      if (parsed) onEventRef.current?.(parsed);
    };
    const onOpen = () => onStatusRef.current?.(true);
    const onClose = () => onStatusRef.current?.(false);

    socket.addEventListener("message", onMessage);
    socket.addEventListener("open", onOpen);
    socket.addEventListener("close", onClose);

    return () => {
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("open", onOpen);
      socket.removeEventListener("close", onClose);
      socket.close();
      socketRef.current = null;
    };
  }, [room, enabled]);

  const send = useCallback((msg: ClientMessage) => {
    const socket = socketRef.current;
    // readyState 1 === OPEN; drop sends while connecting/closed (typing is ephemeral).
    if (socket && socket.readyState === 1) socket.send(JSON.stringify(msg));
  }, []);

  return { send };
}
