"use client";

import { CommunityServerList } from "@/components/community/community-server-list";
import { CommunityServerSidebar } from "@/components/community/community-server-sidebar";
import { CommunityHomeSidebar } from "@/components/community/community-home-sidebar";
import { CommunityModalProvider } from "@/components/community/community-modal-provider";
import { useParams, usePathname } from "next/navigation";

// Communities, redesigned per desktopdesigns/"community landing.svg": the
// server-tile rail sits on the page canvas, and the sidebar + content pair
// lives inside one large rounded card under the header. Columns and all
// community logic are unchanged — only the frame moved.
export default function CommunitiesLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const params = useParams();
    const pathname = usePathname();
    const serverId = params?.serverId as string;

    const isHome = pathname === "/communities" || !serverId;

    return (
        <div className="flex h-svh flex-col overflow-hidden pt-16">
            <CommunityModalProvider />

            <div className="flex min-h-0 w-full flex-1 overflow-hidden">
                {/* Column 1: server tile rail on the canvas */}
                <CommunityServerList />

                {/* Columns 2+3 inside the big rounded preview card */}
                <div className=" ml-0 flex min-w-0 flex-1 overflow-hidden rounded-3xl border border-zinc-500/5 bg-card max-md:m-0 max-md:rounded-none max-md:border-0">
                    {isHome ? (
                        <CommunityHomeSidebar />
                    ) : (
                        <CommunityServerSidebar serverId={serverId} />
                    )}

                    <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
