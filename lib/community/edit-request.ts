import { create } from "zustand";

/**
 * ↑ in an empty composer edits your last message.
 *
 * ## Why a store and not a prop
 *
 * Editing is owned by the ROW (`community-chat-item` holds its own `isEditing`),
 * and the composer is a sibling that never receives the message list. The
 * keyboard contract has had `onEditLastOwnMessage` since Phase 3 and **no
 * composer ever passed it**, because there was no way for the composer to reach
 * the row.
 *
 * A one-field store is the smallest thing that closes that gap without lifting
 * edit state out of the row — which would mean threading it through the list,
 * the memo comparator, and every other consumer for one keystroke.
 *
 * The request is consumed and cleared by whichever row matches, so a stale id
 * can't re-open an editor later.
 */
interface EditRequestState {
    /** The message a composer has asked to edit, or null. */
    messageId: string | null;
    requestEdit: (messageId: string) => void;
    clearEditRequest: () => void;
}

export const useEditRequest = create<EditRequestState>((set) => ({
    messageId: null,
    requestEdit: (messageId) => set({ messageId }),
    clearEditRequest: () => set({ messageId: null }),
}));

/** The shape the finder needs; everything else on a message rides along. */
export type EditableMessage = {
    id: string;
    userId?: string | null;
    deleted?: boolean | null;
    system?: boolean | null;
    isWebhook?: boolean | null;
};

/**
 * The newest message the given user may still edit, scanning newest-first.
 *
 * Deliberately strict about what "yours" means, because ↑ is a blind keystroke —
 * the user is not looking at what it will pick, so picking wrong is worse than
 * picking nothing:
 *
 * - not yours, not editable;
 * - deleted rows have nothing to edit;
 * - system notices are not anybody's speech;
 * - webhook rows are posted by an app, even when they carry your name;
 * - an optimistic `local-` id is a client invention with no server row behind
 *   it, so an edit would address a message that does not exist yet.
 *
 * @param pages newest-first pages, each newest-first — the shape
 *              `community.getMessages` returns.
 */
export function findLastOwnMessageId(
    pages: readonly { items: readonly EditableMessage[] }[] | undefined,
    userId: string | null | undefined,
): string | null {
    if (!pages?.length || !userId) return null;
    for (const page of pages) {
        for (const m of page.items) {
            if (m.userId !== userId) continue;
            if (m.deleted || m.system || m.isWebhook) continue;
            if (m.id.startsWith("local-")) continue;
            return m.id;
        }
    }
    return null;
}
