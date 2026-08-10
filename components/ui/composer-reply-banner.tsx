"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowTurnBackwardIcon, Cancel01Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

/**
 * The strip above a composer saying what you're replying to, or editing.
 *
 * Buzz's `ComposerReplyEditBanner`, in our tokens. Three composers had three of
 * these — DMs inline with its own messageType switch, community chat as a pill,
 * stream chat as a local `ReplyBanner` component — which is three places to fix
 * a wording change and three chances for them to disagree about what a reply
 * looks like.
 *
 * ## Edit outranks reply, and that ordering is the point
 *
 * You can be replying to someone and then hit ↑ to edit your own last message.
 * Both states are live at once, and the banner must say the one that the SEND
 * button will act on — which is the edit. Showing "replying to Alice" while the
 * composer is actually about to rewrite your own message is the kind of thing
 * that gets a half-finished sentence published under someone else's thread.
 *
 * ## Not tucked
 *
 * Buzz nests this behind the composer with `-mb-4 rounded-t-2xl border-b-0` so
 * the two read as one attached surface. Not copied: our three composers sit in
 * different wrappers (`mx-1 mb-1.5` here, a `gap-2` flex column there), and a
 * negative margin tuned against one of them looks broken in the other two. The
 * banner is attached the plain way — rounded top, square bottom, flush with the
 * field — which survives all three.
 */
export function ComposerReplyBanner({
    mode = "reply",
    /** Who you're replying to. Ignored in edit mode, which is about your own message. */
    name,
    /** A short quote of the target. Truncated to one line. */
    preview,
    onCancel,
    className,
}: {
    mode?: "reply" | "edit";
    name?: string | null;
    preview?: string | null;
    onCancel?: () => void;
    className?: string;
}) {
    const editing = mode === "edit";
    return (
        <div
            className={cn(
                "flex items-center gap-2 rounded-t-2xl border border-b-0 bg-white/[0.04] px-3.5 py-2",
                className,
            )}
        >
            <HugeiconsIcon
                icon={editing ? PencilEdit02Icon : ArrowTurnBackwardIcon}
                className={cn("size-3.5 shrink-0 text-zinc-500", !editing && "scale-y-[-1]")}
                strokeWidth={2}
            />
            <p className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-400">
                {editing ? (
                    <span className="font-bold text-zinc-200">Editing message</span>
                ) : (
                    <>
                        Replying to <span className="font-bold text-zinc-200">{name || "message"}</span>
                    </>
                )}
                {preview ? <span className="text-zinc-600"> · {preview}</span> : null}
            </p>
            {onCancel && (
                <button
                    type="button"
                    onClick={onCancel}
                    aria-label={editing ? "Cancel edit" : "Cancel reply"}
                    className="shrink-0 cursor-pointer text-zinc-500 transition-colors hover:text-white motion-reduce:transition-none"
                >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" strokeWidth={2} />
                </button>
            )}
        </div>
    );
}
