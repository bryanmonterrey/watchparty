"use client";

import { create } from "zustand";

/**
 * The Clips overlay's open state.
 *
 * A store rather than context because the two ends of this live on opposite
 * sides of a layout boundary: the Clips TAB is in the home page's right rail,
 * and the button that closes it is the MENU ICON in the app header, which is
 * rendered by (app)/layout.tsx — an ancestor of the page. No provider short of
 * the layout itself contains both, and the header has no other reason to know
 * about home's rail. Same pattern as use-community-modal.
 */
type ClipsOverlayStore = {
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
};

export const useClipsOverlay = create<ClipsOverlayStore>((set) => ({
    open: false,
    onOpen: () => set({ open: true }),
    onClose: () => set({ open: false }),
}));
