"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { CommunityServerHeader } from "./community-server-header";
import { CommunityChannelSection } from "./community-channel-section";
import { CommunityChannelItem } from "./community-channel-item";
import { CommunityChannelReorder } from "./community-channel-reorder";
import { CommunityMemberItem } from "./community-member-item";
import { ServerSidebarSkeleton } from "./community-skeletons";
import { trpc } from "@/lib/trpc/client";

type Props = {
    serverId: string;
};

export function CommunityServerSidebar({ serverId }: Props) {
    const { data, isLoading } = trpc.community.getServer.useQuery({ serverId });

    if (isLoading || !data) {
        return <ServerSidebarSkeleton />;
    }

    const { server, channels, members, currentMember } = data;
    const role = currentMember.role;

    const textChannels = channels.filter((c) => c.type === "TEXT");
    const audioChannels = channels.filter((c) => c.type === "AUDIO");
    const videoChannels = channels.filter((c) => c.type === "VIDEO");
    // Server-wide display order (sections concatenated) — the reorder commit
    // needs the complete list so positions stay globally consistent.
    const allOrdered = [...textChannels, ...audioChannels, ...videoChannels];

    return (
        <div className="flex flex-col h-full w-76 bg-zinc-900/60 shrink-0">
            <CommunityServerHeader server={server} role={role} />

            <ScrollArea className="flex-1">

                {!!textChannels.length && (
                    <div className="mb-2">
                        <CommunityChannelSection
                            sectionType="channels"
                            channelType="TEXT"
                            role={role}
                            label="Text Channels"
                            server={server}
                        />
                        <CommunityChannelReorder
                            channels={textChannels}
                            allChannels={allOrdered}
                            server={server}
                            role={role}
                        />
                    </div>
                )}

                {!!audioChannels.length && (
                    <div className="mb-2">
                        <CommunityChannelSection
                            sectionType="channels"
                            channelType="AUDIO"
                            role={role}
                            label="Voice Channels"
                            server={server}
                        />
                        <CommunityChannelReorder
                            channels={audioChannels}
                            allChannels={allOrdered}
                            server={server}
                            role={role}
                        />
                    </div>
                )}

                {!!videoChannels.length && (
                    <div className="mb-2">
                        <CommunityChannelSection
                            sectionType="channels"
                            channelType="VIDEO"
                            role={role}
                            label="Video Channels"
                            server={server}
                        />
                        <CommunityChannelReorder
                            channels={videoChannels}
                            allChannels={allOrdered}
                            server={server}
                            role={role}
                        />
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
