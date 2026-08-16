import React, { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Share, Star, Copy } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Token } from "@/db/schema/content"
import { SolanaIcon, XIcon, TelegramIcon, GlobeIcon } from "../icons"
import { CalloutButton } from "./callout-button"
import { CoinImage } from "@/components/coins/coin-image";

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

    const socials = [
        token.twitterUrl ? { href: token.twitterUrl, Icon: XIcon, label: `@${token.ticker}` } : null,
        token.telegramUrl ? { href: token.telegramUrl, Icon: TelegramIcon, label: "Telegram" } : null,
        token.websiteUrl ? { href: token.websiteUrl, Icon: GlobeIcon, label: "Website" } : null,
    ].filter((s): s is { href: string; Icon: typeof XIcon; label: string } => s !== null)

    return (
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-5 p-6 bg-panel rounded-[25px]">
            <div className="flex flex-col gap-4">
                {/* Image + Info Row */}
                <div className="flex gap-5 items-start">
                    <div className="size-16 sm:size-20 rounded-2xl bg-zinc-800/85 border border-zinc-700/30 overflow-hidden shrink-0 shadow-md">
                        <CoinImage src={token.imageUrl} alt={token.name} className="size-full animate-fade-in" />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            {/* One step down from text-2xl/3xl: the name shares
                                this row with the ticker and the socials now, and
                                at the old size a normal-length name pushed them
                                onto a second line. Named scale steps, not an
                                arbitrary px value — see scripts/guards/check-text-scale.mjs. */}
                            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white">{token.name}</h1>
                            <span className="text-base font-black text-postgray">${token.ticker}</span>

                            {/* Socials sit WITH the identity, not under it.
                                Icon-only here on purpose: the labelled pills this
                                replaces ("@ticker", "Telegram", "Website") are far
                                too wide to share a line with a name, and the label
                                was never the information — the mark is. The name
                                survives in aria-label, so nothing is lost to a
                                screen reader. */}
                            {socials.length > 0 && (
                                <div className="flex items-center gap-1 pl-0.5">
                                    {socials.map(({ href, Icon, label }) => (
                                        <a
                                            key={href}
                                            href={href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={label}
                                            title={label}
                                            className="grid size-7 place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/5 hover:text-white motion-reduce:transition-none"
                                        >
                                            <Icon className="size-4" />
                                        </a>
                                    ))}
                                </div>
                            )}
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
                                    </AvatarFallback>
                                </Avatar>
                                <span className="font-semibold text-zinc-300 text-sm">
                                    {token.creator.username || token.creator.name}
                                </span>
                            </div>

                            <span className="text-zinc-600 font-light">•</span>

                            <span className="text-zinc-400 text-sm font-medium">{timeAgo}</span>
                        </div>
                    </div>
                </div>

            </div>

            <div className="flex items-start justify-start gap-2 md:gap-3 flex-wrap">
                {token.status === "live" && token.poolAddress && (
                    <CalloutButton tokenId={token.id} ticker={token.ticker} />
                )}
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

