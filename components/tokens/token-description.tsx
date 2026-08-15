import React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { LinkForwardIcon } from "@hugeicons/core-free-icons"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Token } from "@/db/schema/content"
import { cn } from "@/lib/utils"

interface TokenDescriptionProps {
    token: Token & {
        creator: {
            id: string
            name: string
            username: string | null
            avatar_url: string | null
        }
    }
    /**
     * The coin page's swap column is 324px wide; TokenProfile's is the full page.
     * `compact` is that column's dress — the swap-card outline instead of the
     * panel fill, tighter padding, the shared 13/15px type, and an "About"
     * heading, since in the column it sits between named cards and needs one.
     *
     * A variant rather than a restyle because TokenProfile still renders the
     * roomy version at `?legacy=1`.
     */
    compact?: boolean
    /** Card chrome, when the host owns the outline (the coin page's SWAP_CARD). */
    cardClassName?: string
}

export function TokenDescription({ token, compact = false, cardClassName }: TokenDescriptionProps) {
    if (compact) {
        return (
            <div className={cn(cardClassName, "mt-2 flex flex-col gap-2 p-4")}>
                <h3 className="text-15 font-semibold text-flexwhite">About</h3>
                <div className="flex items-center gap-2">
                    <Avatar className="size-5">
                        <AvatarImage src={token.creator.avatar_url || undefined} />
                        <AvatarFallback />
                    </Avatar>
                    <span className="truncate text-13 font-medium text-zinc-300">
                        {token.creator.username || token.creator.name}
                    </span>
                </div>
                <p className="text-13 leading-relaxed text-zinc-400">
                    {token.description || "No description provided."}
                </p>
            </div>
        )
    }

    return (
        <div className="bg-panel rounded-[25px] p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Avatar className="size-6">
                        <AvatarImage src={token.creator.avatar_url || undefined} />
                        <AvatarFallback />
                    </Avatar>
                    <span className="text-lg font-medium text-zinc-300">{token.creator.username || token.creator.name}</span>
                </div>
                <span className="text-base font-medium text-zinc-500 flex items-center gap-1 hover:text-zinc-300 cursor-pointer transition-colors">
                    View on Terminal <HugeiconsIcon icon={LinkForwardIcon} className="size-3" strokeWidth={2} />
                </span>
            </div>
            <p className="text-base text-zinc-400 leading-relaxed">
                {token.description || "No description provided."}
            </p>
        </div>
    )
}
