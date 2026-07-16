import { Metadata } from "next";
import { db } from "@/db";
import { communityServers, communityMembers } from "@/db/schema/community";
import { user } from "@/db/schema/auth/user";
import { eq, and, count, gt } from "drizzle-orm";

// PUBLIC embeddable server widget (Engagement → Server widget). No session,
// no app shell — meant for an <iframe> on the owner's own site. Only servers
// that opted in (widgetEnabled) render; everything else 404-shapes to a
// quiet "unavailable" card so embeds never leak.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Server widget",
    robots: { index: false },
};

async function getWidgetData(serverId: string) {
    const [server] = await db
        .select()
        .from(communityServers)
        .where(and(eq(communityServers.id, serverId), eq(communityServers.widgetEnabled, true)))
        .limit(1);
    if (!server) return null;

    const [{ n: memberCount }] = await db
        .select({ n: count() })
        .from(communityMembers)
        .where(eq(communityMembers.serverId, server.id));

    const [{ n: onlineCount }] = await db
        .select({ n: count() })
        .from(communityMembers)
        .innerJoin(user, eq(communityMembers.userId, user.id))
        .where(and(
            eq(communityMembers.serverId, server.id),
            gt(user.lastSeenAt, new Date(Date.now() - 10 * 60 * 1000)),
        ));

    return {
        name: server.name,
        imageUrl: server.imageUrl,
        tag: server.tag,
        bannerColor: server.bannerColor ?? "#17181C",
        memberCount: Number(memberCount),
        onlineCount: Number(onlineCount),
        inviteCode: server.customInvite ?? server.inviteCode,
    };
}

export default async function WidgetPage({ params }: { params: Promise<{ serverId: string }> }) {
    const { serverId } = await params;
    const data = /^[0-9a-f-]{36}$/.test(serverId) ? await getWidgetData(serverId) : null;

    if (!data) {
        return (
            <div className="grid min-h-screen place-items-center bg-[#0A0A0B] p-4">
                <p className="text-sm font-semibold text-zinc-600">This widget isn&apos;t available.</p>
            </div>
        );
    }

    return (
        <div className="grid min-h-screen place-items-center bg-[#0A0A0B] p-4">
            <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white/[0.04]">
                <div className="h-16 w-full" style={{ backgroundColor: data.bannerColor }} />
                <div className="px-5 pb-5">
                    <div className="-mt-6 grid size-12 place-items-center overflow-hidden rounded-[16px] bg-zinc-900 ring-4 ring-[#0A0A0B]">
                        {data.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={data.imageUrl} alt="" className="size-full object-cover" />
                        ) : (
                            <span className="text-[16px] font-bold text-white/90">{data.name.charAt(0).toUpperCase()}</span>
                        )}
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                        <p className="min-w-0 truncate text-[16px] font-bold tracking-tight text-white">{data.name}</p>
                        {data.tag && (
                            <span className="shrink-0 rounded-[8px] bg-white/10 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-zinc-200">
                                {data.tag}
                            </span>
                        )}
                    </div>
                    <p className="mt-1 flex items-center gap-3 text-[13px] font-medium text-zinc-500">
                        <span className="flex items-center gap-1.5">
                            <span className="inline-block size-2 rounded-full bg-[#00ED89]" />
                            {data.onlineCount} online
                        </span>
                        <span>{data.memberCount} member{data.memberCount === 1 ? "" : "s"}</span>
                    </p>
                    <a
                        href={`https://watchparty.xyz/communities/invite/${data.inviteCode}`}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-4 block w-full rounded-full bg-white py-2.5 text-center text-[14px] font-bold text-black transition-opacity hover:opacity-90"
                    >
                        Join server
                    </a>
                    <p className="mt-3 text-center text-[11px] font-semibold text-zinc-700">watchparty</p>
                </div>
            </div>
        </div>
    );
}
