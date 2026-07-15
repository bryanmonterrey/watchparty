"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";

// Shared between the settings sidebar (sets ?s=) and the content column
// (reads it) so both stay on the same section without prop drilling.
// Grouping mirrors Discord's server-settings anatomy.
export const SETTINGS_SECTIONS = [
    // {server name}
    "profile",
    "tag",
    "engagement",
    "boosts",
    // Expression
    "emoji",
    "stickers",
    "soundboard",
    // People
    "members",
    "roles",
    "invites",
    "access",
    // Apps
    "integrations",
    "apps",
    // Moderation
    "safety",
    "audit",
    "bans",
    "automod",
    // Channels
    "channels",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const LABELS: Record<SettingsSection, string> = {
    profile: "Server profile",
    tag: "Server tag",
    engagement: "Engagement",
    boosts: "Boost perks",
    emoji: "Emoji",
    stickers: "Stickers",
    soundboard: "Soundboard",
    members: "Members",
    roles: "Roles",
    invites: "Invites",
    access: "Access",
    integrations: "Integrations",
    apps: "App directory",
    safety: "Safety setup",
    audit: "Audit log",
    bans: "Bans",
    automod: "AutoMod",
    channels: "Channels",
};

export function sectionLabel(s: SettingsSection): string {
    return LABELS[s];
}

/** Sections only admins can open; everyone else lands on Engagement. */
export const ADMIN_ONLY_SECTIONS: SettingsSection[] = ["profile", "tag", "automod", "access"];

export function useSettingsSection() {
    return useQueryState("s", parseAsStringLiteral(SETTINGS_SECTIONS).withDefault("profile"));
}
