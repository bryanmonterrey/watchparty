import { create } from "zustand";

/**
 * Whether the notifications panel is open.
 *
 * ## Why a store and not local state
 *
 * The panel is rendered by `app-ui/app-sidebar.tsx` and its `open` flag used to
 * be a `React.useState` in that file — which meant only the sidebar could open
 * it. The mobile header wanted the same panel and had no way to reach it, so
 * its bell linked to **`/notifications` instead, a route that does not exist**:
 * the app's only notifications surface is this panel, and the link 404s.
 * (`ALWAYS_PRIVATE_PREFIXES` lists `/notifications` too, which is what made the
 * route look real.)
 *
 * One boolean in a store is the smallest thing that lets any chrome — sidebar,
 * mobile header, a future command palette — open the one panel that exists,
 * without lifting state through a tree that doesn't otherwise share it. Same
 * shape as `lib/premium/overlay-store.ts`.
 *
 * ⚠️ The panel still has to be MOUNTED by someone for this to do anything; the
 * sidebar owns that. A caller that opens it from a tree where the sidebar isn't
 * rendered will flip a flag nothing is listening to.
 */
interface NotificationsOverlayState {
    open: boolean;
    openNotifications: () => void;
    closeNotifications: () => void;
    toggleNotifications: () => void;
}

export const useNotificationsOverlay = create<NotificationsOverlayState>((set) => ({
    open: false,
    openNotifications: () => set({ open: true }),
    closeNotifications: () => set({ open: false }),
    toggleNotifications: () => set((s) => ({ open: !s.open })),
}));
