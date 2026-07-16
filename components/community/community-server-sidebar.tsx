"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { CommunityServerHeader } from "./community-server-header";
import { CommunityChannelSection } from "./community-channel-section";
import { CommunityChannelItem } from "./community-channel-item";
import { CommunityChannelReorder } from "./community-channel-reorder";
import { CommunityMemberItem } from "./community-member-item";
import { ServerSidebarSkeleton } from "./community-skeletons";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { boostLevelFor, nextBoostLevel } from "@/lib/premium/boost-levels";

type Props = {
    serverId: string;
};

export function CommunityServerSidebar({ serverId }: Props) {
    const { data, isLoading } = trpc.community.getServer.useQuery({ serverId });
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const toggle = (key: string) => setCollapsed((c) => ({ ...c, [key]: !c[key] }));

    if (isLoading || !data) {
        return <ServerSidebarSkeleton />;
    }

    const { server, channels, members, currentMember, boostCount, boostedByMe } = data;
    const role = currentMember.role;

    const textChannels = channels.filter((c) => c.type === "TEXT");
    const audioChannels = channels.filter((c) => c.type === "AUDIO");
    const videoChannels = channels.filter((c) => c.type === "VIDEO");
    // Server-wide display order (sections concatenated) — the reorder commit
    // needs the complete list so positions stay globally consistent.
    const allOrdered = [...textChannels, ...audioChannels, ...videoChannels];

    return (
        <div className="flex flex-col h-full w-76 shrink-0 bg-zinc-900/60 overflow-hidden max-md:w-full">
            <CommunityServerHeader
                server={server}
                role={role}
                boostCount={boostCount}
                boostedByMe={boostedByMe}
                muted={!!currentMember.muted}
            />

            {/* Boost goal — opt-in (Boost perks → Show boost progress bar) */}
            {server.showBoostBar && (() => {
                const level = boostLevelFor(boostCount);
                const next = nextBoostLevel(boostCount);
                const pct = next
                    ? Math.min(100, ((boostCount - level.threshold) / (next.threshold - level.threshold)) * 100)
                    : 100;
                return (
                    <div className="mx-3 mb-1 mt-2 rounded-2xl bg-white/[0.04] px-3.5 py-2.5">
                        <div className="flex items-center justify-between text-[12px] font-bold">
                            <span className="text-zinc-300">Boost goal</span>
                            <span className="tabular-nums text-zinc-500">
                                {next ? `${boostCount}/${next.threshold} boosts` : "Max level"}
                            </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                            <div className="h-full rounded-full bg-lantern transition-all" style={{ width: `${pct}%` }} />
                        </div>
                    </div>
                );
            })()}

            <ScrollArea className="flex-1">

                {!!textChannels.length && (
                    <div className="mb-2">
                        <CommunityChannelSection
                            sectionType="channels"
                            channelType="TEXT"
                            role={role}
                            label="Text Channels"
                            server={server}
                            collapsed={!!collapsed.text}
                            onToggleCollapsed={() => toggle("text")}
                        />
                        {!collapsed.text && (
                            <CommunityChannelReorder
                                channels={textChannels}
                                allChannels={allOrdered}
                                server={server}
                                role={role}
                            />
                        )}
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
                            collapsed={!!collapsed.audio}
                            onToggleCollapsed={() => toggle("audio")}
                        />
                        {!collapsed.audio && (
                            <CommunityChannelReorder
                                channels={audioChannels}
                                allChannels={allOrdered}
                                server={server}
                                role={role}
                            />
                        )}
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
                            collapsed={!!collapsed.video}
                            onToggleCollapsed={() => toggle("video")}
                        />
                        {!collapsed.video && (
                            <CommunityChannelReorder
                                channels={videoChannels}
                                allChannels={allOrdered}
                                server={server}
                                role={role}
                            />
                        )}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
