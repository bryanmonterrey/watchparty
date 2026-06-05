import React, { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Share, Star, Copy } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Token } from "@/db/schema/content"
import { Link2Icon } from "../icons"

interface TokenHeaderProps {
    token: Token & {
        creator: {
            id: string
            name: string
            username: string | null
            avatar_url: string | null
        }
    }
}

export function TokenHeader({ token }: TokenHeaderProps) {
    const [copied, setCopied] = useState(false)

    const copyAddress = () => {
        if (!token.tokenAddress) return
        navigator.clipboard.writeText(token.tokenAddress)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const timeAgo = formatDistanceToNow(new Date(token.createdAt), { addSuffix: true })
    const displayAddress = token.tokenAddress 
        ? `${token.tokenAddress.slice(0, 4)}...${token.tokenAddress.slice(-4)}` 
        : "Draft"

    return (
        <div className="flex p-5 pb-1 flex-col md:flex-row md:items-start justify-between gap-4 rounded-3xl">
            <div className="flex gap-4 items-start">
                <div className="size-16 md:size-20 rounded-full bg-zinc-800 border border-zinc-700/10 overflow-hidden shrink-0">
                    {token.imageUrl && (
                        <img src={token.imageUrl} alt={token.name} className="object-cover size-full" />
                    )}
                </div>
                <div className="flex flex-col">
                    <div className="flex items-baseline gap-2">
                        <h1 className="text-2xl md:text-2xl font-bold tracking-tight">{token.name}</h1>
                        
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-base text-zinc-400">
                        <Avatar className="size-5">
                            <AvatarImage src={token.creator.avatar_url || undefined} />
                            <AvatarFallback>{(token.creator.username || token.creator.name || "U").slice(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium hover:text-zinc-200 cursor-pointer transition-colors">
                            {token.creator.username || token.creator.name}
                        </span>
                        <span>•</span>
                        <span>{timeAgo}</span>
                        <span className="text-base md:text-base text-zinc-400 font-black">${token.ticker}</span>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
                <button 
                    className="cursor-pointer flex items-center gap-2 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-100 rounded-full px-5 text-lg font-medium transition-colors border-0">
                    <Link2Icon className="size-5 " />
                    Share
                </button>
                <button 
                    onClick={copyAddress}
                    className="cursor-pointer flex items-center gap-2 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-100 rounded-full px-5 font-medium text-lg transition-colors border-0"
                >
                    <Copy className="size-5" />
                    {copied ? "Copied!" : displayAddress}
                </button>
                <button className="cursor-pointer flex items-center justify-center gap-2 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 text-zinc-100 rounded-full h-11 w-11 border-0 transition-colors">
                    <Star className="size-5" />
                </button>
            </div>
        </div>
    )
}
