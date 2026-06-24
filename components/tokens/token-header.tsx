import React, { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Share, Star, Copy } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Token } from "@/db/schema/content"
import { SolanaIcon, XIcon, TelegramIcon, GlobeIcon } from "../icons"

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

    const websiteUrl = `https://${token.name.toLowerCase().replace(/[^a-z0-9]/g, "") || "token"}.xyz`
    const twitterUrl = `https://x.com/${token.ticker.toLowerCase()}`
    const telegramUrl = `https://t.me/${token.ticker.toLowerCase()}`

    return (
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-5 p-6 bg-card rounded-[25px]">
            <div className="flex flex-col sm:flex-row gap-5 items-start">
                <div className="size-16 sm:size-20 rounded-2xl bg-zinc-800/85 border border-zinc-700/30 overflow-hidden shrink-0 shadow-md">
                    {token.imageUrl ? (
                        <img src={token.imageUrl} alt={token.name} className="object-cover size-full animate-fade-in" />
                    ) : (
                        <div className="size-full flex items-center justify-center font-bold text-2xl text-zinc-400 bg-zinc-800">
                            {token.ticker.slice(0, 2).toUpperCase()}
                        </div>
                    )}
                </div>
                
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">{token.name}</h1>
                        <span className="text-lg font-black text-postgray">${token.ticker}</span>
                    </div>

                    <div className="flex items-center gap-3 text-base text-zinc-400 flex-wrap">
                        {/* Solana badge */}
                        <div className="flex items-center gap-1 py-0.5 px-2 bg-zinc-800/60 border border-zinc-700/40 rounded-full text-zinc-300 font-semibold text-xs tracking-wider uppercase">
                            <SolanaIcon className="size-3.5 text-zinc-300" />
                            Solana
                        </div>

                        <span className="text-zinc-600 font-light">•</span>
                        
                        {/* Creator info */}
                        <div className="flex items-center gap-1.5 hover:text-zinc-200 cursor-pointer transition-colors">
                            <Avatar className="size-5 border border-zinc-700/50">
                                <AvatarImage src={token.creator.avatar_url || undefined} />
                                <AvatarFallback className="bg-zinc-800 text-zinc-400 text-[10px] font-bold">
                                    {(token.creator.username || token.creator.name || "U").slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <span className="font-semibold text-zinc-300 text-sm">
                                {token.creator.username || token.creator.name}
                            </span>
                        </div>

                        <span className="text-zinc-600 font-light">•</span>

                        <span className="text-zinc-400 text-sm font-medium">{timeAgo}</span>
                    </div>

                    {/* Social pills */}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <a 
                            href={twitterUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 py-1.5 px-3.5 bg-zinc-800/40 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700/50 text-zinc-300 hover:text-white rounded-full text-xs font-semibold tracking-wide transition-all"
                        >
                            <XIcon className="size-3.5" />
                            <span>@{token.ticker}</span>
                        </a>
                        <a 
                            href={telegramUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 py-1.5 px-3.5 bg-zinc-800/40 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700/50 text-zinc-300 hover:text-white rounded-full text-xs font-semibold tracking-wide transition-all"
                        >
                            <TelegramIcon className="size-3.5" />
                            <span>Telegram</span>
                        </a>
                        <a 
                            href={websiteUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 py-1.5 px-3.5 bg-zinc-800/40 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700/50 text-zinc-300 hover:text-white rounded-full text-xs font-semibold tracking-wide transition-all"
                        >
                            <GlobeIcon className="size-3.5" />
                            <span>Website</span>
                        </a>
                    </div>
                </div>
            </div>

            <div className="flex items-start justify-start gap-2 md:gap-3 flex-wrap">
                <button 
                    className="cursor-pointer flex items-center gap-2 py-2.5 bg-white text-black hover:bg-zinc-100 font-bold rounded-full px-5 text-sm transition-all shadow-md active:scale-95"
                >
                    <Share className="size-4" />
                    Share
                </button>
                <button 
                    onClick={copyAddress}
                    className="cursor-pointer flex items-center gap-2 py-2.5 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/30 text-zinc-100 rounded-full px-5 font-bold text-sm transition-all shadow-sm active:scale-95"
                >
                    <Copy className="size-4 text-zinc-400" />
                    {copied ? "Copied!" : displayAddress}
                </button>
                <button className="cursor-pointer flex items-center justify-center py-2.5 bg-zinc-800/80 hover:bg-zinc-800 border border-zinc-700/30 text-zinc-100 rounded-full h-10 w-10 transition-all active:scale-95 hover:text-amber-400">
                    <Star className="size-4" />
                </button>
            </div>
        </div>
    )
}

