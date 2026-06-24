import React from "react"
import { Button } from "@/components/ui/button"
import { Token } from "@/db/schema/content"

export function TokenChatCard({ token }: { token: Token }) {
    return (
        <div className="bg-card rounded-[25px] p-5 flex items-center justify-between group cursor-pointer transition-all hover:bg-card/90">
            <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-zinc-800 overflow-hidden shrink-0">
                    {token.imageUrl && <img src={token.imageUrl} alt={token.name} className="object-cover size-full" />}
                </div>
                <div className="flex flex-col">
                    <span className="text-lg font-bold text-zinc-200">{token.ticker} chat</span>
                    <span className="text-base text-zinc-500">Chat with others</span>
                </div>
            </div>
            <Button variant="secondary" size="sm" className="bg-zinc-800 text-zinc-300 border-0 h-10 rounded-full font-semibold text-base group-hover:bg-zinc-700 transition-colors">
                Join chat
            </Button>
        </div>
    )
}
