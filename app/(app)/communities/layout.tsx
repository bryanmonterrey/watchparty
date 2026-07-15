"use client";

import { CommunityServerList } from "@/components/community/community-server-list";
import { CommunityServerSidebar } from "@/components/community/community-server-sidebar";
import { CommunityHomeSidebar } from "@/components/community/community-home-sidebar";
import { ServerSettingsSidebar } from "@/components/community/server-settings-sidebar";
import { CommunityModalProvider } from "@/components/community/community-modal-provider";
import { useParams, usePathname } from "next/navigation";

// Communities, full-bleed (same treatment as /messages): rail, sidebar and
// content run edge to edge and top to bottom — no rounded card, no outer
// border. Full-height hairlines divide the columns; the rail and sidebar
// pad down past the floating header while the chat column owns its own
// space from the very top. Columns and all community logic are unchanged.
export default function CommunitiesLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const params = useParams();
    const pathname = usePathname();
    const serverId = params?.serverId as string;

    const isHome = pathname === "/communities" || !serverId;
    // Server settings swaps the channel sidebar for the settings rail —
    // same columns, same anatomy, no overlay.
    const isSettings = !!serverId && pathname?.startsWith(`/communities/${serverId}/settings`);

    return (
        <div className="flex h-svh w-screen flex-col overflow-hidden">
            <CommunityModalProvider />

            <div className="flex min-h-0 w-full flex-1 overflow-hidden">
                {/* Column 1: server tile rail (full height; content pads below
                    the floating header internally) */}
                <CommunityServerList />

                {/* Columns 2+3 */}
                <div className="flex min-w-0 flex-1 overflow-hidden md:pl-2">
                    {isHome ? (
                        <CommunityHomeSidebar />
                    ) : isSettings ? (
                        <ServerSettingsSidebar serverId={serverId} />
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
