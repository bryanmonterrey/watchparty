"use client";

import { Hash, UserPlus, ShieldAlert, ShieldCheck, Crown } from "lucide-react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useCommunityModal } from "@/hooks/use-community-modal";
import type { CommunityServer } from "@/db/schema/community";

type Member = {
    id: string;
    role: string;
    userId: string;
    userName: string | null;
    userImage: string | null;
    userUsername: string | null;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    channelName: string;
    channelType?: string;
    server: CommunityServer;
    members: Member[];
    ownerId: string;
    onlineUserIds?: string[];
    canInvite?: boolean;
};

const roleRank: Record<string, number> = { ADMIN: 0, MODERATOR: 1, GUEST: 2 };

export function CommunityChannelInfo({
    open,
    onOpenChange,
    channelName,
    server,
    members,
    ownerId,
    onlineUserIds = [],
    canInvite = true,
}: Props) {
    const { onOpen } = useCommunityModal();
    const online = new Set(onlineUserIds);

    const byRole = (a: Member, b: Member) => (roleRank[a.role] ?? 9) - (roleRank[b.role] ?? 9);
    const onlineMembers = members.filter((m) => online.has(m.userId)).sort(byRole);
    const offlineMembers = members.filter((m) => !online.has(m.userId)).sort(byRole);

    const renderGroup = (title: string, list: Member[]) => {
        if (!list.length) return null;
        return (
            <div className="mb-4">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-flexwhite/40 px-2 mb-2">
                    {title} — {list.length}
                </h3>
                {list.map((member) => {
                    const isOnline = online.has(member.userId);
                    return (
                        <div
                            key={member.id}
                            className="w-full flex items-center gap-x-2.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition"
                        >
                            <div className={cn("relative", !isOnline && "opacity-50")}>
                                <Avatar className="h-8 w-8">
                                    <AvatarImage src={member.userImage ?? undefined} alt={member.userName ?? ""} />
                                    <AvatarFallback className="bg-zinc-700 text-flexwhite text-xs">
                                        {(member.userName ?? "?").charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div
                                    className={cn(
                                        "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-black",
                                        isOnline ? "bg-twitter shadow-[0_0_6px_var(--color-twitter)]" : "bg-zinc-600"
                                    )}
                                />
                            </div>
                            <div className={cn("flex items-center gap-x-1 min-w-0", !isOnline && "opacity-50")}>
                                <span className="text-sm font-medium text-flexwhite/80 truncate">
                                    {member.userName ?? member.userUsername ?? "Unknown"}
                                </span>
                                {member.userId === ownerId && <Crown className="h-3.5 w-3.5 text-twitter2 shrink-0" />}
                                {member.role === "ADMIN" && member.userId !== ownerId && (
                                    <ShieldAlert className="h-3.5 w-3.5 text-twitter shrink-0" />
                                )}
                                {member.role === "MODERATOR" && (
                                    <ShieldCheck className="h-3.5 w-3.5 text-twitter2 shrink-0" />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="w-full sm:max-w-sm bg-black border-l border-flexwhite/15 p-0 text-flexwhite"
            >
                {/* Channel hero */}
                <SheetHeader className="p-6 pb-5 border-b border-flexwhite/10">
                    <div className="flex flex-col items-center text-center gap-3">
                        <div className="size-16 rounded-3xl bg-white/5 border border-flexwhite/10 flex items-center justify-center">
                            <Hash className="size-8 text-twitter" />
                        </div>
                        <div>
                            <SheetTitle className="text-xl font-bold text-flexwhite">{channelName}</SheetTitle>
                            <p className="text-sm text-flexwhite/40 mt-0.5">{server.name}</p>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-flexwhite/50 mt-1">
                            <span className="flex items-center gap-1.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-twitter" />
                                {onlineMembers.length} online
                            </span>
                            <span>{members.length} members</span>
                        </div>
                    </div>

                    {canInvite && (
                        <button
                            onClick={() => onOpen("invite", { server })}
                            className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-twitter text-black font-semibold text-sm hover:bg-twitter2 active:scale-[0.98] transition-all"
                        >
                            <UserPlus className="size-4" />
                            Invite People
                        </button>
                    )}
                </SheetHeader>

                {/* Members */}
                <ScrollArea className="flex-1 h-[calc(100%-13rem)] px-3 py-4">
                    {renderGroup("Online", onlineMembers)}
                    {renderGroup("Offline", offlineMembers)}
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}
