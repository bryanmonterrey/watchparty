"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { XIcon, TelegramIcon, DiscordIcon, RedditIcon, GlobeIcon } from "@/components/icons";
import { Token, TokenLink } from "../../types";

interface TokenAboutProps {
    token: Token;
}

function LinkIcon({ type }: { type: string }) {
    switch (type) {
        case "twitter":
        case "x":
            return <XIcon className="size-4" />;
        case "telegram":
            return <TelegramIcon className="size-4" />;
        case "discord":
            return <DiscordIcon className="size-4" />;
        case "reddit":
            return <RedditIcon className="size-4" />;
        default:
            return <GlobeIcon className="size-4" />;
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
                        "text-13 font-medium leading-relaxed text-zinc-400",
                        !isExpanded && "line-clamp-3"
                    )}>
                        {token.description}
                    </p>
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="mt-2 cursor-pointer text-12 font-bold text-zinc-500 transition-colors hover:text-white"
                    >
                        {isExpanded ? "Show less" : "Show more"}
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
                            className="flex cursor-pointer items-center gap-2 rounded-full bg-white/[0.06] px-4 py-2 text-12 font-bold text-zinc-300 transition-colors hover:bg-white/[0.12] hover:text-white"
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
