import { z } from "zod";

// Single source of truth for profile social links: platform keys, labels,
// input placeholders, and handle→URL normalization. The `user.socials` jsonb
// column stores { [platform]: handle-or-url }; everything else (edit dialog,
// about card, zod validation) derives from this registry.

export const SOCIAL_PLATFORMS = [
    "twitter",
    "instagram",
    "youtube",
    "tiktok",
    "twitch",
    "kick",
    "discord",
    "telegram",
    "github",
    "email",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type SocialLinks = Partial<Record<SocialPlatform, string>>;

export const socialLinksSchema = z.object(
    Object.fromEntries(
        SOCIAL_PLATFORMS.map((p) => [p, z.string().trim().max(200).optional()]),
    ) as Record<SocialPlatform, z.ZodOptional<z.ZodString>>,
);

export const SOCIAL_META: Record<SocialPlatform, { label: string; placeholder: string; urlPrefix: string }> = {
    twitter:   { label: "X / Twitter", placeholder: "@handle",          urlPrefix: "https://x.com/" },
    instagram: { label: "Instagram",   placeholder: "@handle",          urlPrefix: "https://instagram.com/" },
    youtube:   { label: "YouTube",     placeholder: "@channel",         urlPrefix: "https://youtube.com/@" },
    tiktok:    { label: "TikTok",      placeholder: "@handle",          urlPrefix: "https://tiktok.com/@" },
    twitch:    { label: "Twitch",      placeholder: "channel",          urlPrefix: "https://twitch.tv/" },
    kick:      { label: "Kick",        placeholder: "channel",          urlPrefix: "https://kick.com/" },
    discord:   { label: "Discord",     placeholder: "invite code",      urlPrefix: "https://discord.gg/" },
    telegram:  { label: "Telegram",    placeholder: "@handle",          urlPrefix: "https://t.me/" },
    github:    { label: "GitHub",      placeholder: "username",         urlPrefix: "https://github.com/" },
    email:     { label: "Email",       placeholder: "you@example.com",  urlPrefix: "mailto:" },
};

/** Handle-or-url → absolute href. Accepts "@name", "name", or a full URL. */
export function socialHref(platform: SocialPlatform, value: string): string {
    const v = value.trim();
    if (platform === "email") return v.startsWith("mailto:") ? v : `mailto:${v}`;
    if (/^https?:\/\//i.test(v)) return v;
    return SOCIAL_META[platform].urlPrefix + v.replace(/^@/, "");
}

/** Ordered [platform, value] entries with empties dropped. */
export function socialEntries(socials: SocialLinks | null | undefined): [SocialPlatform, string][] {
    if (!socials) return [];
    return SOCIAL_PLATFORMS.flatMap((p) => {
        const v = socials[p]?.trim();
        return v ? ([[p, v]] as [SocialPlatform, string][]) : [];
    });
}
