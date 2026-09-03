import { cache } from "react";
import type { Metadata } from "next";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { communityMembers, communityServers } from "@/db/schema/community";
import { fallbackShareMetadata, shareMetadata } from "@/lib/share/metadata";
import { ogImage } from "@/lib/share/og-url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The share card for a server and every channel under it. Lives on the
// layout because the channel page is a client component and cannot export
// generateMetadata itself; the server page only redirects into a channel.
const getServerCard = cache(async (serverId: string) => {
    const [server] = await db
        .select({
            name: communityServers.name,
            imageUrl: communityServers.imageUrl,
            description: communityServers.description,
            privateProfile: communityServers.privateProfile,
        })
        .from(communityServers)
        .where(eq(communityServers.id, serverId))
        .limit(1);
    if (!server) return null;
    const [members] = await db
        .select({ count: count() })
        .from(communityMembers)
        .where(eq(communityMembers.serverId, serverId));
    return { ...server, members: members?.count ?? 0 };
});

export async function generateMetadata({ params }: { params: Promise<{ serverId: string }> }): Promise<Metadata> {
    const { serverId } = await params;
    const path = `/communities/${serverId}`;
    if (!UUID.test(serverId)) return fallbackShareMetadata(path, "community");
    try {
        const server = await getServerCard(serverId);
        if (!server) return fallbackShareMetadata(path, "community not found");
        // A private profile shows only name + icon everywhere else (the
        // invite page included), so the card keeps the same silence.
        const open = !server.privateProfile;
        return shareMetadata({
            title: server.name,
            description: (open && server.description) || `${server.name} on watchparty`,
            path,
            image: ogImage("community", {
                name: server.name,
                icon: server.imageUrl,
                description: open ? server.description : null,
                members: open ? server.members : null,
            }),
        });
    } catch (err) {
        console.error("[communities] generateMetadata failed:", err);
        return fallbackShareMetadata(path, "community");
    }
}

// Wrapped by /communities/layout.tsx, which renders the server rail and
// sidebar columns; this just provides the content column frame.
export default function ServerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex flex-col flex-1 h-full min-w-0">
            {children}
        </div>
    );
}
