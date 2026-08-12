"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
    InstagramIcon,
    YoutubeIcon,
    TiktokIcon,
    GithubIcon,
    Mail01Icon,
} from "@hugeicons/core-free-icons";
import { XIcon, DiscordIcon, TwitchIcon, KickIcon, TelegramIcon } from "@/components/icons";
import { socialEntries, socialHref, SOCIAL_META, type SocialLinks, type SocialPlatform } from "@/lib/profile/socials";
import { cn } from "@/lib/utils";

// Icon-per-platform renderer for `user.socials`. Brand marks come from
// components/icons.tsx where we have them; HugeIcons fills the gaps.

function PlatformGlyph({ platform, className }: { platform: SocialPlatform; className?: string }) {
    switch (platform) {
        case "twitter": return <XIcon className={className} />;
        case "discord": return <DiscordIcon className={className} />;
        case "twitch": return <TwitchIcon className={className} />;
        case "kick": return <KickIcon className={className} />;
        case "telegram": return <TelegramIcon className={className} />;
        case "instagram": return <HugeiconsIcon icon={InstagramIcon} className={className} />;
        case "youtube": return <HugeiconsIcon icon={YoutubeIcon} className={className} />;
        case "tiktok": return <HugeiconsIcon icon={TiktokIcon} className={className} />;
        case "github": return <HugeiconsIcon icon={GithubIcon} className={className} />;
        case "email": return <HugeiconsIcon icon={Mail01Icon} className={className} />;
    }
}

export function SocialLinksRow({ socials, className, compact = false }: {
    socials: SocialLinks | null | undefined;
    className?: string;
    /** Inline size for sitting next to the name on the profile top line —
     *  smaller circles, no background until hover, so a row of them reads as
     *  quiet metadata beside the display name rather than a button cluster. */
    compact?: boolean;
}) {
    const entries = socialEntries(socials);
    if (!entries.length) return null;

    return (
        <div className={cn("flex flex-wrap items-center", compact ? "gap-0.5" : "gap-1.5", className)}>
            {entries.map(([platform, value]) => (
                <a
                    key={platform}
                    href={socialHref(platform, value)}
                    target={platform === "email" ? undefined : "_blank"}
                    rel="noopener noreferrer"
                    title={SOCIAL_META[platform].label}
                    className={cn(
                        "flex items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-white",
                        compact
                            ? "size-7 hover:bg-white/10"
                            : "size-9 bg-white/5 hover:bg-white/10",
                    )}
                >
                    <PlatformGlyph platform={platform} className={compact ? "size-[15px]" : "size-[18px]"} />
                </a>
            ))}
        </div>
    );
}
