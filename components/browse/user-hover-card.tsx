"use client";

import React from "react";
import { MiniProfile } from "@/components/profile/mini-profile-card";

// Legacy name kept so existing call sites don't churn — the implementation is
// the avatar-anchored mini-profile popout (docs/design-brief-2026-07.md §1).
// New surfaces should import MiniProfile directly.

interface UserHoverCardProps {
    userId?: string | null;
    username?: string | null;
    children: React.ReactNode;
}

export function UserHoverCard({ userId, username, children }: UserHoverCardProps) {
    return <MiniProfile userId={userId} username={username}>{children}</MiniProfile>;
}
