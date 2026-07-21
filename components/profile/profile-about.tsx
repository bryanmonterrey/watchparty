"use client";

import { UserType } from "@/db/schema/auth/user";
import { AboutCard } from "./about-card";
import { PanelGrid } from "./panels/panel-grid";

// About tab = the structured about card (socials, bio, details) + the
// Twitch/Kick-style user-made panel grid. Both are self-contained modules.

interface ProfileAboutProps {
    user: UserType;
}

export function ProfileAbout({ user }: ProfileAboutProps) {
    return (
        <div className="flex max-w-5xl flex-col gap-8">
            <AboutCard user={user} />
            <PanelGrid userId={user.id} />
        </div>
    );
}
