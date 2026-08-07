"use client";

import { create } from "zustand";

/**
 * Whether the assistant is in its fullscreen OVERLAY mode (not merely open —
 * the docked panel doesn't count).
 *
 * A store for the same reason as use-clips-overlay: the two ends live on
 * opposite sides of a layout boundary. The control that toggles it is the
 * resize button inside the panel, which the home dock renders; the thing that
 * has to react is the APP HEADER's scroll backdrop, rendered by
 * (app)/layout.tsx — an ancestor. Nothing short of the layout contains both.
 */
type AskOverlayStore = {
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
};

export const useAskOverlay = create<AskOverlayStore>((set) => ({
    open: false,
    onOpen: () => set({ open: true }),
    onClose: () => set({ open: false }),
}));
