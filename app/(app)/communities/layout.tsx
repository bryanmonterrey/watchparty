"use client";

import { CommunityServerList } from "@/components/community/community-server-list";
import { CommunityServerSidebar } from "@/components/community/community-server-sidebar";
import { CommunityHomeSidebar } from "@/components/community/community-home-sidebar";
import { ServerSettingsSidebar } from "@/components/community/server-settings-sidebar";
import { CommunityModalProvider } from "@/components/community/community-modal-provider";
import { useParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

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
    const inChannel = !!serverId && pathname?.includes("/channels/");

    // Phone shows ONE column at a time (Discord-mobile style):
    // - /communities            → rail + home sidebar (main hidden)
    // - /communities/[serverId] → rail + channel list (main hidden)
    // - a channel or settings   → main only, full width (back affordances
    //   live in the chat/settings headers)
    // - other home paths (shop, quests, friends…) → rail + main
    const isCommunitiesRoot = pathname === "/communities";
    const phoneShowsSidebar = isCommunitiesRoot || (!isHome && !isSettings && !inChannel);
    const phoneShowsMain = !phoneShowsSidebar;
    const phoneShowsRail = !inChannel && !isSettings;

    return (
        <div className="flex h-svh w-screen flex-col overflow-hidden max-md:pt-16 max-md:pb-20">
            <CommunityModalProvider />

            <div className="flex min-h-0 w-full flex-1 overflow-hidden">
                {/* Column 1: server tile rail (full height; content pads below
                    the floating header internally) */}
                <div className={cn("flex h-full", !phoneShowsRail && "max-md:hidden")}>
                    <CommunityServerList />
                </div>

                {/* Columns 2+3 — the rail's own pr-5 is the gutter, so no extra pad */}
                <div className="flex min-w-0 flex-1 overflow-hidden">
                    <div
                        className={cn(
                            "flex h-full min-w-0",
                            phoneShowsSidebar ? "max-md:flex-1" : "max-md:hidden",
                        )}
                    >
                        {isHome ? (
                            <CommunityHomeSidebar />
                        ) : isSettings ? (
                            <ServerSettingsSidebar serverId={serverId} />
                        ) : (
                            <CommunityServerSidebar serverId={serverId} />
                        )}
                    </div>

                    <main
                        className={cn(
                            "relative flex min-w-0 flex-1 flex-col overflow-hidden",
                            !phoneShowsMain && "max-md:hidden",
                        )}
                    >
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
