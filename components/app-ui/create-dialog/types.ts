// The create dialog's public surface, split out of create-dialog.tsx so the
// component file stays under the size guard (scripts/guards/check-file-sizes.mjs).
import type * as React from "react"

/** The dialog's tabs — each one a surface a user can create from. */
export type Tab = "video" | "post" | "coin" | "stream" | "space"

/** The video tab's two steps. */
export type Step = "upload" | "details"

export interface CreateDialogProps extends React.HTMLAttributes<HTMLElement> {
    children: React.ReactNode
    /** Controlled mode — the header's create dropdown opens this on a chosen
     *  tab, so it can't own its own open state there. Omit both and it stays
     *  self-contained: the child is the trigger, as before. */
    open?: boolean
    onOpenChange?: (open: boolean) => void
    /** Which tab to land on. Defaults to video, which is what the trigger did. */
    initialTab?: Tab
}
