"use client";

import { useCallback } from "react";
import type { KeyboardEvent } from "react";

/**
 * The keyboard contract every composer in the app should share.
 *
 * Ported from buzz's rich-text composer, minus TipTap — all of it applies to a
 * plain textarea, and getting it right here means a later editor swap is a
 * rendering change rather than a behaviour rewrite.
 *
 * | Key            | Behaviour                                              |
 * |----------------|--------------------------------------------------------|
 * | Enter          | Send — unless an autocomplete is open, which takes it   |
 * | Shift+Enter    | Newline                                                 |
 * | Escape         | Unwind one layer: autocomplete → reply → blur           |
 * | ArrowUp (empty)| Edit your last message, if the caller can do it         |
 *
 * Two things that look like details and aren't:
 *
 * - **Autocomplete wins Enter.** Reading it from a ref rather than state keeps
 *   the handler stable, so the textarea isn't re-bound on every open/close.
 * - **Escape unwinds one layer at a time.** Clearing everything at once means a
 *   stray Escape while picking a mention also throws away your reply target.
 */

export type ComposerKeyHandlers = {
    /** Send. Return false to decline (empty, already sending). */
    onSubmit: () => boolean | void;
    /** True while a mention/emoji/channel list is open and owns Enter/Tab. */
    isAutocompleteOpen?: () => boolean;
    /** Accept the highlighted autocomplete item. */
    onAcceptAutocomplete?: () => void;
    /** Close the autocomplete without accepting. */
    onCloseAutocomplete?: () => void;
    /** Cancel an active reply target. Return true if there was one. */
    onCancelReply?: () => boolean;
    /**
     * ArrowUp in an empty composer: enter edit mode on the caller's last
     * message. Return true if a target was found, so the keystroke is consumed;
     * false lets the caret move normally.
     */
    onEditLastOwnMessage?: () => boolean;
    /** Current text — ArrowUp only triggers edit when this is empty. */
    getValue: () => string;
};

export function useComposerKeys({
    onSubmit,
    isAutocompleteOpen,
    onAcceptAutocomplete,
    onCloseAutocomplete,
    onCancelReply,
    onEditLastOwnMessage,
    getValue,
}: ComposerKeyHandlers) {
    return useCallback(
        (event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
            const autocompleteOpen = isAutocompleteOpen?.() ?? false;

            if (event.key === "Enter" || event.key === "Tab") {
                if (autocompleteOpen && onAcceptAutocomplete) {
                    event.preventDefault();
                    onAcceptAutocomplete();
                    return;
                }
                // Tab with no autocomplete is focus movement, not ours.
                if (event.key === "Tab") return;

                // Shift+Enter is a newline. So is any modifier combination —
                // ⌘/Ctrl+Enter means "send" in some apps and "newline" in
                // others; leaving it as a newline is the safe read since Enter
                // already sends.
                if (event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;

                event.preventDefault();
                onSubmit();
                return;
            }

            if (event.key === "Escape") {
                if (autocompleteOpen && onCloseAutocomplete) {
                    event.preventDefault();
                    onCloseAutocomplete();
                    return;
                }
                if (onCancelReply?.()) {
                    event.preventDefault();
                    return;
                }
                event.currentTarget.blur();
                return;
            }

            if (event.key === "ArrowUp" && !autocompleteOpen && onEditLastOwnMessage) {
                // Only from a genuinely empty composer: with text present,
                // ArrowUp is caret movement and hijacking it is infuriating.
                if (getValue().length > 0) return;
                if (onEditLastOwnMessage()) event.preventDefault();
            }
        },
        [
            getValue,
            isAutocompleteOpen,
            onAcceptAutocomplete,
            onCancelReply,
            onCloseAutocomplete,
            onEditLastOwnMessage,
            onSubmit,
        ],
    );
}
