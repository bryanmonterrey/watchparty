"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Hash, Mic, Video } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { VisuallyHidden } from "@/components/ui/visually-hidden";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

const typeIcon = { TEXT: Hash, AUDIO: Mic, VIDEO: Video } as const;

// Quick switcher (the Discord pattern): one palette over everything you can
// jump to — unread channels surface first, then all channels, then servers.
// cmdk handles filtering + keyboard nav; Enter navigates.
export function CommunityQuickSwitcher({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const router = useRouter();
    const [query, setQuery] = useState("");
    const { data: channels = [] } = trpc.community.quickSwitch.useQuery(undefined, { enabled: open });

    const close = () => {
        setQuery("");
        onOpenChange(false);
    };

    const go = (href: string) => {
        close();
        router.push(href);
    };

    const unreadChannels = channels.filter((c) => c.unreadCount > 0);
    const servers = [...new Map(channels.map((c) => [c.serverId, c])).values()];

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) close(); else onOpenChange(o); }}>
            <DialogContent
                showCloseButton={false}
                className="gap-0 overflow-hidden rounded-4xl border-none p-0 sm:max-w-[560px]"
            >
                <VisuallyHidden>
                    <DialogTitle>Search communities</DialogTitle>
                </VisuallyHidden>
                <Command loop shouldFilter className="bg-transparent">
                    <div className="p-4 pb-3">
                        <Command.Input
                            value={query}
                            onValueChange={setQuery}
                            autoFocus
                            placeholder="Where would you like to go?"
                            className="h-14 w-full rounded-[18px] bg-white/[0.06] px-5 text-[16px] font-semibold tracking-tight text-white outline-none transition-colors placeholder:text-zinc-600 focus:bg-white/[0.1]"
                        />
                    </div>

                    <Command.List className="max-h-[380px] overflow-y-auto px-2.5 pb-3 hidden-scrollbar">
                        <Command.Empty className="py-10 text-center">
                            <p className="text-[14px] font-bold text-zinc-400">Nowhere to go</p>
                            <p className="mt-0.5 text-[12px] font-medium text-zinc-600">No servers or channels match that</p>
                        </Command.Empty>

                        {!query && unreadChannels.length > 0 && (
                            <Command.Group heading="Unread" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-zinc-500">
                                {unreadChannels.map((c) => (
                                    <ChannelRow key={`unread-${c.channelId}`} c={c} onSelect={go} valuePrefix="unread" />
                                ))}
                            </Command.Group>
                        )}

                        <Command.Group heading="Channels" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-zinc-500">
                            {channels.map((c) => (
                                <ChannelRow key={c.channelId} c={c} onSelect={go} valuePrefix="ch" />
                            ))}
                        </Command.Group>

                        <Command.Group heading="Servers" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-zinc-500">
                            {servers.map((s) => (
                                <Command.Item
                                    key={s.serverId}
                                    value={`srv ${s.serverName} ${s.serverId}`}
                                    onSelect={() => go(`/communities/${s.serverId}`)}
                                    className="flex cursor-pointer items-center gap-3 rounded-[16px] px-3 py-2.5 data-[selected=true]:bg-white/[0.07]"
                                >
                                    <Avatar className="size-7 shrink-0 rounded-[9px]">
                                        <AvatarImage src={s.serverImage || undefined} alt={s.serverName} />
                                        <AvatarFallback className="rounded-[9px] bg-white/10 text-[11px] font-bold text-zinc-300">
                                            {s.serverName[0]?.toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-white">{s.serverName}</span>
                                </Command.Item>
                            ))}
                        </Command.Group>
                    </Command.List>

                    <div className="border-t border-white/5 px-5 py-2.5">
                        <p className="text-[11px] font-medium text-zinc-600">
                            <span className="font-bold text-zinc-500">↑↓</span> to navigate · <span className="font-bold text-zinc-500">↵</span> to jump · <span className="font-bold text-zinc-500">esc</span> to close
                        </p>
                    </div>
                </Command>
            </DialogContent>
        </Dialog>
    );
}

type SwitchChannel = {
    channelId: string;
    channelName: string;
    channelType: "TEXT" | "AUDIO" | "VIDEO";
    serverId: string;
    serverName: string;
    unreadCount: number;
};

function ChannelRow({
    c,
    onSelect,
    valuePrefix,
}: {
    c: SwitchChannel;
    onSelect: (href: string) => void;
    valuePrefix: string;
}) {
    const Icon = typeIcon[c.channelType];
    return (
        <Command.Item
            value={`${valuePrefix} ${c.channelName} ${c.serverName} ${c.channelId}`}
            onSelect={() => onSelect(`/communities/${c.serverId}/channels/${c.channelId}`)}
            className="flex cursor-pointer items-center gap-2.5 rounded-[16px] px-3 py-2.5 data-[selected=true]:bg-white/[0.07]"
        >
            <Icon className="size-4 shrink-0 text-zinc-500" />
            <span className={cn("min-w-0 truncate text-[14px]", c.unreadCount > 0 ? "font-bold text-white" : "font-semibold text-zinc-300")}>
                {c.channelName}
            </span>
            {c.unreadCount > 0 && (
                <span className="shrink-0 rounded-full bg-pastelred px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {c.unreadCount > 99 ? "99+" : c.unreadCount}
                </span>
            )}
            <span className="ml-auto shrink-0 truncate pl-3 text-[12px] font-medium text-zinc-600">{c.serverName}</span>
        </Command.Item>
    );
}
