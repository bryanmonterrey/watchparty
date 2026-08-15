"use client";

import { create } from "zustand";

/**
 * Whether the profile page at `/<username>` is currently showing the LIVE view
 * (the stream player) rather than the plain profile.
 *
 * A store for the same reason as use-ask-overlay: the two ends sit on opposite
 * sides of a layout boundary. Live is a MODE of the profile page, held in
 * `UserProfile`'s `showLive`; the thing that has to react is the APP HEADER's
 * scroll backdrop, rendered by (app)/layout.tsx — an ancestor. The header
 * otherwise knows only the pathname, and `/<username>` is the same path in
 * both modes, so the mode has to be published to it.
 */
type ProfileLiveViewStore = {
    live: boolean;
    setLive: (live: boolean) => void;
};

export const useProfileLiveView = create<ProfileLiveViewStore>((set) => ({
    live: false,
    setLive: (live) => set({ live }),
}));
