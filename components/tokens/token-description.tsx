import React from "react"
import { Share } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Token } from "@/db/schema/content"

interface TokenDescriptionProps {
    token: Token & {
        creator: {
            id: string
            name: string
            username: string | null
            avatar_url: string | null
        }
    }
}

export function TokenDescription({ token }: TokenDescriptionProps) {
    return (
        <div className="bg-panel rounded-[25px] p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Avatar className="size-6">
                        <AvatarImage src={token.creator.avatar_url || undefined} />
                        <AvatarFallback>{(token.creator.username || token.creator.name || "U").slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <span className="text-lg font-medium text-zinc-300">{token.creator.username || token.creator.name}</span>
                </div>
                <span className="text-base font-medium text-zinc-500 flex items-center gap-1 hover:text-zinc-300 cursor-pointer transition-colors">
                    View on Terminal <Share className="size-3" />
                </span>
            </div>
            <p className="text-base text-zinc-400 leading-relaxed">
                {token.description || "No description provided."}
            </p>
        </div>
    )
}
