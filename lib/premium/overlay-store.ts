// Global open/close state for the "Upgrade to Premium" overlay, so any component
// (premium gate, header CTA, settings) can summon it. The overlay itself is
// mounted once in (app)/layout.tsx.
import { create } from "zustand";
import type { TierKey } from "./tiers";

interface PremiumOverlayState {
    open: boolean;
    /** Optional tier to preselect / business view to land on. */
    initialTier?: TierKey;
    openOverlay: (initialTier?: TierKey) => void;
    closeOverlay: () => void;
}

export const usePremiumOverlay = create<PremiumOverlayState>((set) => ({
    open: false,
    initialTier: undefined,
    openOverlay: (initialTier) => set({ open: true, initialTier }),
    closeOverlay: () => set({ open: false, initialTier: undefined }),
}));
