"use client";

import { create } from "zustand";

type HomeFeedOverlayStore = {
    open: boolean;
    onOpen: () => void;
    onClose: () => void;
};

export const useHomeFeedOverlay = create<HomeFeedOverlayStore>((set) => ({
    open: false,
    onOpen: () => set({ open: true }),
    onClose: () => set({ open: false }),
}));
