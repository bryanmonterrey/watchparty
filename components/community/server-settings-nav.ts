"use client";

import { parseAsStringLiteral, useQueryState } from "nuqs";

// Shared between the settings sidebar (sets ?s=) and the content column
// (reads it) so both stay on the same section without prop drilling.
export const SETTINGS_SECTIONS = [
    "profile",
    "engagement",
    "boosts",
    "members",
    "roles",
    "invites",
    "bans",
    "channels",
    "automod",
    "audit",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

const LABELS: Record<SettingsSection, string> = {
    profile: "Server profile",
    engagement: "Engagement",
    boosts: "Boosts",
    members: "Members",
    roles: "Roles",
    invites: "Invites",
    bans: "Bans",
    channels: "Channels",
    automod: "AutoMod",
    audit: "Audit log",
};

export function sectionLabel(s: SettingsSection): string {
    return LABELS[s];
}

export function useSettingsSection() {
    return useQueryState("s", parseAsStringLiteral(SETTINGS_SECTIONS).withDefault("profile"));
}
