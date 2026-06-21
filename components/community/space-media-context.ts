"use client";

import { createContext, useContext } from "react";

/**
 * Light context for Spaces WebRTC audio — NO RealtimeKit SDK import, so any
 * component can read media state without pulling the heavy SDK into its bundle.
 * The real values come from `SpaceMediaProvider` (dynamically loaded).
 */
export type SpaceMediaStatus = "connecting" | "connected" | "error" | "disabled";

export type SpaceMediaState = {
  status: SpaceMediaStatus;
  /** Whether the local mic is currently publishing. */
  micEnabled: boolean;
  /** Whether the caller's role (HOST/SPEAKER) is allowed to publish audio. */
  canSpeak: boolean;
  toggleMic: () => void;
};

const DEFAULT: SpaceMediaState = {
  status: "connecting",
  micEnabled: false,
  canSpeak: false,
  toggleMic: () => {},
};

export const SpaceMediaContext = createContext<SpaceMediaState>(DEFAULT);

export const useSpaceMedia = () => useContext(SpaceMediaContext);
