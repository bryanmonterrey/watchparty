"use client";

import {
    ChevronDown,
    LogOut,
    PlusCircle,
    Rocket,
    Settings,
    Trash,
    UserPlus,
    Users,
} from "lucide-react";
import { toast } from "sonner";
import { GooDropdown, type GooDropdownItem } from "@/components/ui/goo-dropdown";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { trpc } from "@/lib/trpc/client";
import type { CommunityServer } from "@/db/schema/community";

type Props = {
    server: CommunityServer;
    role?: string;
    boostCount?: number;
    boostedByMe?: boolean;
};

export function CommunityServerHeader({ server, role, boostCount = 0, boostedByMe = false }: Props) {
    const { onOpen } = useCommunityModal();
    const utils = trpc.useUtils();
    const toggleBoost = trpc.community.toggleBoost.useMutation({
        onSuccess: () => {
            utils.community.getServer.invalidate({ serverId: server.id });
            utils.community.boostBalance.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });

    const isAdmin = role === "ADMIN";
    const isModerator = isAdmin || role === "MODERATOR";

    const rowClass = "px-3 text-sm cursor-pointer text-neutral-400 font-medium hover:bg-zinc-800 hover:text-neutral-200";

    const items: GooDropdownItem[] = [
        {
            key: "boost",
            onClick: () => toggleBoost.mutate({ serverId: server.id }),
            className: `${rowClass} ${boostedByMe ? "text-white hover:text-white" : ""}`,
            label: (
                <>
                    {boostedByMe ? "Boosted" : "Boost Server"}
                    {boostCount > 0 && (
                        <span className="ml-1.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] font-bold leading-none">
                            {boostCount}
                        </span>
                    )}
                    <Rocket className="h-4 w-4 ml-auto" />
                </>
            ),
        },
        { key: "boost-sep", type: "separator" as const },
        ...(isModerator
            ? [
                  {
                      key: "invite",
                      onClick: () => onOpen("invite", { server }),
                      className: `${rowClass} text-indigo-400 hover:text-indigo-300`,
                      label: (
                          <>
                              Invite People
                              <UserPlus className="h-4 w-4 ml-auto" />
                          </>
                      ),
                  },
              ]
            : []),
        ...(isAdmin
            ? [
                  {
                      key: "settings",
                      onClick: () => onOpen("editServer", { server }),
                      className: rowClass,
                      label: (
                          <>
                              Server Settings
                              <Settings className="h-4 w-4 ml-auto" />
                          </>
                      ),
                  },
                  {
                      key: "members",
                      onClick: () => onOpen("members", { server }),
                      className: rowClass,
                      label: (
                          <>
                              Manage Members
                              <Users className="h-4 w-4 ml-auto" />
                          </>
                      ),
                  },
              ]
            : []),
        ...(isModerator
            ? [
                  {
                      key: "create-channel",
                      onClick: () => onOpen("createChannel", { server }),
                      className: rowClass,
                      label: (
                          <>
                              Create Channel
                              <PlusCircle className="h-4 w-4 ml-auto" />
                          </>
                      ),
                  },
                  { key: "sep", type: "separator" as const },
              ]
            : []),
        ...(isAdmin
            ? [
                  {
                      key: "delete",
                      onClick: () => onOpen("deleteServer", { server }),
                      className: `${rowClass} text-rose-500 hover:text-rose-400`,
                      label: (
                          <>
                              Delete Server
                              <Trash className="h-4 w-4 ml-auto" />
                          </>
                      ),
                  },
              ]
            : [
                  {
                      key: "leave",
                      onClick: () => onOpen("leaveServer", { server }),
                      className: `${rowClass} text-rose-500 hover:text-rose-400`,
                      label: (
                          <>
                              Leave Server
                              <LogOut className="h-4 w-4 ml-auto" />
                          </>
                      ),
                  },
              ]),
    ];

    return (
        <GooDropdown
            className="w-full"
            align="start"
            width={224}
            itemHeight={36}
            buttonRadius={0}
            fill="#18181b"
            triggerClassName="w-full text-md cursor-pointer font-semibold px-3 py-4.5 flex items-center hover:bg-zinc-900 transition text-white"
            trigger={
                <>
                    {server.name}
                    <ChevronDown className="h-5 w-5 ml-auto" />
                </>
            }
            items={items}
        />
    );
}
