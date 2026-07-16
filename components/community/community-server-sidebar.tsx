"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ChevronDown } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MoreHorizontalIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { CommunityServerHeader } from "./community-server-header";
import { CommunityChannelSection } from "./community-channel-section";
import { CommunityChannelItem } from "./community-channel-item";
import { CommunityChannelReorder } from "./community-channel-reorder";
import { CommunityMemberItem } from "./community-member-item";
import { ServerSidebarSkeleton } from "./community-skeletons";
import { useState } from "react";
import { trpc } from "@/lib/trpc/client";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { boostLevelFor, nextBoostLevel } from "@/lib/premium/boost-levels";
import { isAfter, subMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import type { CommunityChannelCategory, CommunityServer } from "@/db/schema/community";

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

    const { server, channels, categories, members, currentMember, boostCount, boostedByMe } = data;
    const role = currentMember.role;

    // Ungrouped channels keep the classic type sections; categorized channels
    // render below in their (mixed-type, Discord-style) category groups.
    const ungrouped = channels.filter((c) => !c.categoryId);
    const textChannels = ungrouped.filter((c) => c.type === "TEXT");
    const audioChannels = ungrouped.filter((c) => c.type === "AUDIO");
    const videoChannels = ungrouped.filter((c) => c.type === "VIDEO");
    const byCategory = new Map(categories.map((cat) => [cat.id, channels.filter((c) => c.categoryId === cat.id)]));
    // Server-wide display order (sections concatenated) — the reorder commit
    // needs the complete list so positions stay globally consistent.
    const allOrdered = [
        ...textChannels,
        ...audioChannels,
        ...videoChannels,
        ...categories.flatMap((cat) => byCategory.get(cat.id) ?? []),
    ];

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

                {/* Active now — members seen in the last 10 min (Engagement → Activity) */}
                {server.activityFeed && (() => {
                    const active = members.filter((m) =>
                        m.lastSeenAt && isAfter(new Date(m.lastSeenAt), subMinutes(new Date(), 10)),
                    );
                    if (active.length === 0) return null;
                    return (
                        <div className="px-3 pb-1 pt-2">
                            <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                                Active now — {active.length}
                            </p>
                            <div className="flex items-center gap-1 overflow-hidden px-1">
                                {active.slice(0, 8).map((m) => (
                                    <div key={m.id} className="relative shrink-0" title={m.userName ?? undefined}>
                                        <div className="size-7 overflow-hidden rounded-full bg-zinc-800">
                                            {m.userImage ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={m.userImage} alt="" className="size-full object-cover" />
                                            ) : (
                                                <span className="grid size-full place-items-center text-[11px] font-bold text-zinc-400">
                                                    {(m.userName ?? "?").charAt(0).toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                        <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-lantern ring-2 ring-zinc-900" />
                                    </div>
                                ))}
                                {active.length > 8 && (
                                    <span className="ml-1 text-[11px] font-bold text-zinc-600">+{active.length - 8}</span>
                                )}
                            </div>
                        </div>
                    );
                })()}

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

                {/* Categories — Discord-style collapsible groups, mixed channel types */}
                {categories.map((cat) => (
                    <div key={cat.id} className="mb-2">
                        <CategoryHeader
                            category={cat}
                            server={server}
                            role={role}
                            collapsed={!!collapsed[cat.id]}
                            onToggleCollapsed={() => toggle(cat.id)}
                        />
                        {!collapsed[cat.id] && (
                            <CommunityChannelReorder
                                channels={byCategory.get(cat.id) ?? []}
                                allChannels={allOrdered}
                                server={server}
                                role={role}
                            />
                        )}
                    </div>
                ))}
            </ScrollArea>
        </div>
    );
}

function CategoryHeader({
    category,
    server,
    role,
    collapsed,
    onToggleCollapsed,
}: {
    category: CommunityChannelCategory;
    server: CommunityServer;
    role?: string;
    collapsed: boolean;
    onToggleCollapsed: () => void;
}) {
    const { onOpen } = useCommunityModal();
    const utils = trpc.useUtils();
    const deleteCategory = trpc.community.deleteCategory.useMutation({
        onSuccess: () => utils.community.getServer.invalidate({ serverId: server.id }),
    });
    const canManage = role === "ADMIN" || role === "MODERATOR";

    return (
        <div className="group flex items-center justify-between py-2 pl-3 pr-2">
            <button
                onClick={onToggleCollapsed}
                className="flex min-w-0 cursor-pointer items-center gap-1 text-xs font-semibold text-zinc-400 transition-colors hover:text-zinc-200"
            >
                <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-200", collapsed && "-rotate-90")} />
                <span className="truncate">{category.name}</span>
            </button>

            {canManage && (
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                        onClick={() => onOpen("createChannel", { server, categoryId: category.id })}
                        title="Create channel in category"
                        className="grid size-5 cursor-pointer place-items-center text-zinc-400 transition-colors hover:text-zinc-200"
                    >
                        <HugeiconsIcon icon={PlusSignIcon} className="size-4" strokeWidth={2} />
                    </button>
                    <GooDropdown
                        align="end"
                        width={200}
                        itemHeight={36}
                        fill="#18181b"
                        triggerAriaLabel="Category options"
                        triggerClassName="grid size-5 cursor-pointer place-items-center text-zinc-400 transition-colors hover:text-zinc-200"
                        trigger={<HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" strokeWidth={2} />}
                        items={[
                            {
                                key: "rename",
                                onClick: () => onOpen("createCategory", { server, category }),
                                className: "px-3 text-[13px] font-semibold text-zinc-200 hover:bg-zinc-800",
                                label: "Rename category",
                            },
                            {
                                key: "delete",
                                onClick: () => deleteCategory.mutate({ serverId: server.id, categoryId: category.id }),
                                className: "px-3 text-[13px] font-semibold text-pastelred hover:bg-zinc-800 hover:text-pastelred",
                                label: "Delete category",
                            },
                        ]}
                    />
                </div>
            )}
        </div>
    );
}
