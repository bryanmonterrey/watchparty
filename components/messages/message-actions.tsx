"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    CornerUpLeftIcon,
    Delete02Icon,
    PencilEdit02Icon,
    PinIcon,
    PinOffIcon,
    SmileIcon,
} from "@hugeicons/core-free-icons";

import { EmojiPicker } from "./emoji-picker";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { recordQuickReaction, useQuickReactions } from "@/hooks/use-quick-reactions";
import { cn } from "@/lib/utils";

/**
 * The hover toolbar on a chat message — community rows AND DM bubbles.
 * Anatomy ported from buzz's `MessageActionBar`, in watchparty's own chrome.
 *
 * What the previous inline version got wrong, and why each matters:
 *
 * - **`hidden group-hover:flex`** — `display:none` cannot transition, so the
 *   bar popped in. Now opacity + `pointer-events`, which animates and still
 *   doesn't intercept clicks while hidden.
 * - **No keyboard path.** `group-hover` alone means a keyboard user can never
 *   reach reply/edit/delete. `group-focus-within` opens it on tab.
 * - **It vanished mid-interaction.** Moving the pointer toward an open emoji
 *   picker left the row, hid the bar, and closed the picker. It now stays
 *   pinned open while a picker or menu is open.
 * - **Unreachable on touch.** `group-hover` never fires on a touch device, so
 *   there was no way to react, reply, or delete on mobile at all. The bar is
 *   always visible below `sm`.
 * - **Destructive action with no confirm.** Delete fired on first click.
 * - **Icons as click targets.** `<Edit onClick>` gave no button semantics, no
 *   accessible name, and a 16px hit area.
 * - **A gray drop shadow**, against the house rule. Depth here is the hairline
 *   border plus the backdrop blur.
 *
 * Quick reactions are the headline addition: four frecency-ranked emoji that
 * send on one click, so the common case stops being "open picker, search,
 * click".
 *
 * Note these are plain `<button>`s rather than the `Button` primitive — the
 * h-11 control height is right for forms and wrong for a compact bar floating
 * over a 36px chat row.
 */

const ICON = "h-4 w-4";
const BTN =
    "grid size-7 shrink-0 place-items-center rounded-full text-flexwhite/55 transition-colors hover:bg-flexwhite/10 hover:text-flexwhite disabled:opacity-40 disabled:pointer-events-none";

export type MessageActionsProps = {
    /**
     * Scopes the quick-reaction frecency store. A community id keeps the emoji
     * you reach for in one server separate from another's; `null` is the
     * app-wide bucket that DMs and stream chat share.
     */
    reactionScope?: string | null;
    onReact: (emoji: string) => void;
    onReply: () => void;
    /** Omit any of these and the control simply isn't rendered. */
    onEdit?: () => void;
    onDelete?: () => void;
    onTogglePin?: () => void;
    isPinned?: boolean;
    pinPending?: boolean;
    /** Which side of the row it sits on — DM bubbles alternate. */
    align?: "left" | "right";
};

export function MessageActions({
    reactionScope = null,
    onReact,
    onReply,
    onEdit,
    onDelete,
    onTogglePin,
    isPinned = false,
    pinPending = false,
    align = "right",
}: MessageActionsProps) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const quickReactions = useQuickReactions(4, reactionScope);

    // Any open surface pins the bar; otherwise moving the pointer toward it
    // closes the thing you were reaching for.
    const pinnedOpen = pickerOpen || confirmingDelete;

    const react = (emoji: string) => {
        recordQuickReaction(emoji, reactionScope);
        onReact(emoji);
    };

    return (
        <div
            className={cn(
                "absolute -top-3 z-10 flex items-center gap-0.5 rounded-full",
                align === "right" ? "right-4" : "left-4",
                "border border-flexwhite/12 bg-black3/95 p-1 backdrop-blur-sm",
                // Hidden state keeps layout but takes no clicks. Always visible
                // on touch, where there is no hover to reveal it.
                "transition-opacity duration-150 ease-out motion-reduce:transition-none",
                "sm:pointer-events-none sm:opacity-0",
                "sm:group-hover:pointer-events-auto sm:group-hover:opacity-100",
                "sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100",
                pinnedOpen && "sm:pointer-events-auto sm:opacity-100",
            )}
            data-testid="message-actions"
        >
            {confirmingDelete ? (
                // Inline confirm rather than a dialog: the row is right there,
                // so a modal would hide the thing being deleted.
                <div className="flex items-center gap-1 px-1">
                    <span className="text-[11px] font-medium text-flexwhite/70">Delete?</span>
                    <button
                        type="button"
                        onClick={() => { setConfirmingDelete(false); onDelete?.(); }}
                        className="rounded-full bg-sunset/90 px-2 py-0.5 text-[11px] font-semibold text-white transition-colors hover:bg-sunset"
                    >
                        Delete
                    </button>
                    <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        className="rounded-full px-2 py-0.5 text-[11px] font-medium text-flexwhite/60 transition-colors hover:text-flexwhite"
                    >
                        Cancel
                    </button>
                </div>
            ) : (
                <>
                    {quickReactions.map((emoji) => (
                        <Tooltip key={emoji}>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    aria-label={`React with ${emoji}`}
                                    onClick={() => react(emoji)}
                                    className={cn(BTN, "text-base leading-none")}
                                >
                                    <span aria-hidden>{emoji}</span>
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top"><p className="text-xs">{emoji}</p></TooltipContent>
                        </Tooltip>
                    ))}

                    <span aria-hidden className="mx-0.5 h-4 w-px bg-flexwhite/12" />

                    <EmojiPicker onEmojiSelect={(e: { native: string }) => react(e.native)} onOpenChange={setPickerOpen}>
                        <button type="button" aria-label="Add reaction" className={BTN}>
                            <HugeiconsIcon icon={SmileIcon} className={ICON} strokeWidth={2} />
                        </button>
                    </EmojiPicker>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button type="button" aria-label="Reply" onClick={onReply} className={BTN}>
                                <HugeiconsIcon icon={CornerUpLeftIcon} className={ICON} strokeWidth={2} />
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top"><p className="text-xs">Reply</p></TooltipContent>
                    </Tooltip>

                    {onTogglePin && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    aria-label={isPinned ? "Unpin message" : "Pin message"}
                                    onClick={onTogglePin}
                                    disabled={pinPending}
                                    className={BTN}
                                >
                                    <HugeiconsIcon icon={isPinned ? PinOffIcon : PinIcon} className={ICON} strokeWidth={2} />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top"><p className="text-xs">{isPinned ? "Unpin" : "Pin"}</p></TooltipContent>
                        </Tooltip>
                    )}

                    {onEdit && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button type="button" aria-label="Edit message" onClick={onEdit} className={BTN}>
                                    <HugeiconsIcon icon={PencilEdit02Icon} className={ICON} strokeWidth={2} />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top"><p className="text-xs">Edit</p></TooltipContent>
                        </Tooltip>
                    )}

                    {onDelete && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    aria-label="Delete message"
                                    onClick={() => setConfirmingDelete(true)}
                                    className={cn(BTN, "hover:bg-sunset/15 hover:text-sunset")}
                                >
                                    <HugeiconsIcon icon={Delete02Icon} className={ICON} strokeWidth={2} />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top"><p className="text-xs">Delete</p></TooltipContent>
                        </Tooltip>
                    )}
                </>
            )}
        </div>
    );
}
