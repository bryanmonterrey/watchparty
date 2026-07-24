"use client";

import { useParams } from "next/navigation";
import { ServerSettings } from "@/components/community/server-settings";

// Server settings content column — the communities layout swaps the channel
// sidebar for the settings rail on this route; ESC returns to the server.
export default function ServerSettingsPage() {
    const params = useParams();
    const serverId = params?.serverId as string;
    if (!serverId) return null;
    return <ServerSettings serverId={serverId} />;
}
