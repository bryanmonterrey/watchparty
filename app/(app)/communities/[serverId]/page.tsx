import { notFound, redirect } from "next/navigation";
import { db } from "@/db";
import { communityChannels } from "@/db/schema/community";
import { eq, asc } from "drizzle-orm";

// Port of sidebar's (browse)/communities/[serverId]/page.tsx — redirects to
// the server's #general (or first) channel. Server-side, so the client never
// downloads this page's JS, fetches, and *then* redirects — the channel page
// itself enforces membership via its getServer query.
export default async function ServerPage({ params }: { params: Promise<{ serverId: string }> }) {
    const { serverId } = await params;

    // The old tRPC route zod-validated this as a uuid; without it a malformed
    // id makes Postgres throw a cast error instead of 404ing.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(serverId)) {
        notFound();
    }

    const channels = await db
        .select({ id: communityChannels.id, name: communityChannels.name })
        .from(communityChannels)
        .where(eq(communityChannels.serverId, serverId))
        .orderBy(asc(communityChannels.createdAt));

    const target = channels.find((c) => c.name === "general") ?? channels[0];
    if (target) {
        redirect(`/communities/${serverId}/channels/${target.id}`);
    }

    return (
        <div className="flex flex-1 items-center justify-center">
            <p className="text-zinc-400">This server has no channels yet</p>
        </div>
    );
}
