"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Globe } from "lucide-react";
import { XIcon, TelegramIcon, DiscordIcon, RedditIcon } from "@/components/icons";
import { Token, TokenLink } from "../../types";

interface TokenAboutProps {
    token: Token;
}

function LinkIcon({ type }: { type: string }) {
    switch (type) {
        case "twitter":
        case "x":
            return <XIcon className="w-4 h-4" />;
        case "telegram":
            return <TelegramIcon className="w-4 h-4" />;
        case "discord":
            return <DiscordIcon className="w-4 h-4" />;
        case "reddit":
            return <RedditIcon className="w-4 h-4" />;
        default:
            return <Globe className="w-4 h-4" />;
    }
}

function linkLabel(link: TokenLink): string {
    if (link.label) return link.label;
    switch (link.type) {
        case "twitter":
        case "x":      return "X";
        case "telegram": return "Telegram";
        case "discord":  return "Discord";
        case "reddit":   return "Reddit";
        case "website":  return "Website";
        default:         return link.type.charAt(0).toUpperCase() + link.type.slice(1);
    }
}

export function TokenAbout({ token }: TokenAboutProps) {
    const [isExpanded, setIsExpanded] = React.useState(false);

    const hasDescription = !!token.description;
    const hasLinks = !!(token.links && token.links.length > 0);

    if (!hasDescription && !hasLinks) return null;

    return (
        <div className="space-y-4">
            {hasDescription && (
                <div className="relative">
                    <p className={cn(
                        "text-md leading-relaxed text-zinc-400 font-medium transition-all",
                        !isExpanded && "line-clamp-3"
                    )}>
                        {token.description}
                    </p>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="mt-2 text-[14px] font-bold text-zinc-300 hover:text-white transition-colors cursor-pointer"
                    >
                        {isExpanded ? "Show Less" : "Show More"}
                    </button>
                </div>
            )}

            {hasLinks && (
                <div className="flex items-center flex-wrap gap-2">
                    {token.links!.map((link, i) => (
                        <a
                            key={i}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 px-4 py-2 bg-gray1 rounded-full text-[13px] font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-all cursor-pointer"
                        >
                            <LinkIcon type={link.type} />
                            {linkLabel(link)}
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
