import type { Metadata } from "next";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { communityMembers, communityServers } from "@/db/schema/community";
import { fallbackShareMetadata, shareMetadata } from "@/lib/share/metadata";
import { ogImage } from "@/lib/share/og-url";

// Invite links are the community URL people actually paste around, so this
// is the card that matters most. The page itself is a client component
// (join button + tRPC), hence the metadata lives on the layout.
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
    const { code } = await params;
    const path = `/communities/invite/${code}`;
    try {
        const [server] = await db
            .select({
                id: communityServers.id,
                name: communityServers.name,
                imageUrl: communityServers.imageUrl,
                description: communityServers.description,
                privateProfile: communityServers.privateProfile,
            })
            .from(communityServers)
            .where(eq(communityServers.inviteCode, code))
            .limit(1);
        if (!server) return fallbackShareMetadata(path, "invite not found");
        const open = !server.privateProfile;
        const [members] = open
            ? await db.select({ count: count() }).from(communityMembers).where(eq(communityMembers.serverId, server.id))
            : [null];
        return shareMetadata({
            title: `Join ${server.name}`,
            description: (open && server.description) || `You're invited to ${server.name} on watchparty`,
            path,
            noIndex: true,
            image: ogImage("community", {
                name: server.name,
                icon: server.imageUrl,
                description: open ? server.description : null,
                members: members?.count,
                invite: true,
            }),
        });
    } catch (err) {
        console.error("[invite] generateMetadata failed:", err);
        return fallbackShareMetadata(path, "invite");
    }
}

export default function InviteLayout({ children }: { children: React.ReactNode }) {
    return children;
}
