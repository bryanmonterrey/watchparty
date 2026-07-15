"use client";

import { useParams } from "next/navigation";
import { ServerSettings } from "@/components/community/server-settings";

// Full-screen server settings — renders as a fixed overlay above the
// communities layout (rail/sidebar stay mounted underneath), ESC closes.
export default function ServerSettingsPage() {
    const params = useParams();
    const serverId = params?.serverId as string;
    if (!serverId) return null;
    return <ServerSettings serverId={serverId} />;
}
