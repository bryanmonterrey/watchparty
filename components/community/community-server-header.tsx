"use client";

import {
    ChevronDown,
    LogOut,
    PlusCircle,
    Settings,
    Trash,
    UserPlus,
    Users,
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCommunityModal } from "@/hooks/use-community-modal";
import type { CommunityServer } from "@/db/schema/community";

type Props = {
    server: CommunityServer;
    role?: string;
};

export function CommunityServerHeader({ server, role }: Props) {
    const { onOpen } = useCommunityModal();

    const isAdmin = role === "ADMIN";
    const isModerator = isAdmin || role === "MODERATOR";

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button className="w-full text-md cursor-pointer font-semibold px-3 py-4.5 flex items-center hover:bg-zinc-900 transition text-white">
                    {server.name}
                    <ChevronDown className="h-5 w-5 ml-auto" />
                </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent className="w-56 text-xs font-medium text-neutral-400 space-y-[2px]">
                {isModerator && (
                    <DropdownMenuItem
                        onClick={() => onOpen("invite", { server })}
                        className="text-indigo-400 px-3 py-2 text-sm cursor-pointer"
                    >
                        Invite People
                        <UserPlus className="h-4 w-4 ml-auto" />
                    </DropdownMenuItem>
                )}
                {isAdmin && (
                    <DropdownMenuItem
                        onClick={() => onOpen("editServer", { server })}
                        className="px-3 py-2 text-sm cursor-pointer"
                    >
                        Server Settings
                        <Settings className="h-4 w-4 ml-auto" />
                    </DropdownMenuItem>
                )}
                {isAdmin && (
                    <DropdownMenuItem
                        onClick={() => onOpen("members", { server })}
                        className="px-3 py-2 text-sm cursor-pointer"
                    >
                        Manage Members
                        <Users className="h-4 w-4 ml-auto" />
                    </DropdownMenuItem>
                )}
                {isModerator && (
                    <DropdownMenuItem
                        onClick={() => onOpen("createChannel", { server })}
                        className="px-3 py-2 text-sm cursor-pointer"
                    >
                        Create Channel
                        <PlusCircle className="h-4 w-4 ml-auto" />
                    </DropdownMenuItem>
                )}
                {isModerator && <DropdownMenuSeparator />}
                {isAdmin && (
                    <DropdownMenuItem
                        onClick={() => onOpen("deleteServer", { server })}
                        className="text-rose-500 px-3 py-2 text-sm cursor-pointer"
                    >
                        Delete Server
                        <Trash className="h-4 w-4 ml-auto" />
                    </DropdownMenuItem>
                )}
                {!isAdmin && (
                    <DropdownMenuItem
                        onClick={() => onOpen("leaveServer", { server })}
                        className="text-rose-500 px-3 py-2 text-sm cursor-pointer"
                    >
                        Leave Server
                        <LogOut className="h-4 w-4 ml-auto" />
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
