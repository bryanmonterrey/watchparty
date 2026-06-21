"use client";

import PartySocket from "partysocket";
import { PARTY } from "./protocol";

const HOST = process.env.NEXT_PUBLIC_REALTIME_HOST;

/** Whether realtime is configured in this environment. */
export function isRealtimeEnabled(): boolean {
  return !!HOST;
}

async function fetchToken(): Promise<string> {
  const res = await fetch("/api/realtime/token");
  if (!res.ok) throw new Error(`realtime token: ${res.status}`);
  const data = (await res.json()) as { token?: string };
  if (!data.token) throw new Error("realtime token missing");
  return data.token;
}

/**
 * Open a connection to a realtime room. `query` is a function so a fresh,
 * short-lived token is fetched on every (re)connect — survives token expiry.
 */
export function createRoomSocket(room: string): PartySocket {
  if (!HOST) throw new Error("NEXT_PUBLIC_REALTIME_HOST is not set");
  return new PartySocket({
    host: HOST,
    party: PARTY,
    room,
    query: async () => ({ token: await fetchToken() }),
  });
}
