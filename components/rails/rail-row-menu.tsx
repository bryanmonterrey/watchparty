"use client";

import { useState } from "react";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { PostOptionsMenu } from "@/components/browse/post-card/post-options-menu";

/**
 * The rail row's overflow menu.
 *
 * A feed video IS a post, so this opens the app's real PostOptionsMenu — report,
 * not-interested, pin, highlight, analytics, embed, delete on your own — rather
 * than a bespoke list of rows that would either duplicate it or invent actions
 * with nothing behind them.
 *
 * Open state lives here, per row, so the rail can render one of these alongside
 * every video without hoisting a map of open flags.
 */
export function RailRowMenu({ postId, userId }: { postId: string; userId?: string | null }) {
    const [open, setOpen] = useState(false);

    return (
        <PostOptionsMenu
            postId={postId}
            userId={userId}
            open={open}
            onOpenChange={setOpen}
            onClose={() => setOpen(false)}
            triggerClassName={cn(
                "cursor-pointer rounded-full p-1 text-flexwhite/90 transition-colors hover:bg-white/10 hover:text-white",
                open && "text-white",
            )}
            // Matches the engagement mark it sits beside.
            trigger={<MoreVertical className="size-5" />}
        />
    );
}
