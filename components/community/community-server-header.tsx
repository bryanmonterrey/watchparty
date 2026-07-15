"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    ArrowDown01Icon,
    Copy01Icon,
    Logout01Icon,
    PlusSignIcon,
    Rocket01Icon,
    Settings01Icon,
    UserAdd01Icon,
} from "@hugeicons/core-free-icons";
import { GooDropdown, type GooDropdownItem } from "@/components/ui/goo-dropdown";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { useAuthSession } from "@/hooks/use-auth-session";
import { trpc } from "@/lib/trpc/client";
import type { CommunityServer } from "@/db/schema/community";

type Props = {
    server: CommunityServer;
    role?: string;
    boostCount?: number;
    boostedByMe?: boolean;
};

// Server name menu (the Discord anatomy): boost on top, member actions in
// the middle, the one red action last. Owners manage/delete through Server
// Settings; everyone else gets Leave.
export function CommunityServerHeader({ server, role, boostCount = 0, boostedByMe = false }: Props) {
    const { onOpen } = useCommunityModal();
    const { data: session } = useAuthSession();
    const router = useRouter();
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
    const isOwner = server.ownerId === session?.user?.id;

    const rowClass = "px-3 text-sm cursor-pointer text-neutral-400 font-medium hover:bg-zinc-800 hover:text-neutral-200";
    const iconClass = "h-4 w-4 ml-auto";

    const copyInvite = () => {
        navigator.clipboard.writeText(`${window.location.origin}/communities/invite/${server.inviteCode}`);
        toast.success("Invite link copied");
    };

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
                    <HugeiconsIcon icon={Rocket01Icon} className={iconClass} strokeWidth={2} />
                </>
            ),
        },
        { key: "sep-boost", type: "separator" as const },
        {
            key: "invite",
            onClick: () => onOpen("invite", { server }),
            className: rowClass,
            label: (
                <>
                    Invite People
                    <HugeiconsIcon icon={UserAdd01Icon} className={iconClass} strokeWidth={2} />
                </>
            ),
        },
        ...(isModerator
            ? [
                  {
                      key: "settings",
                      onClick: () => router.push(`/communities/${server.id}/settings`),
                      className: rowClass,
                      label: (
                          <>
                              Server Settings
                              <HugeiconsIcon icon={Settings01Icon} className={iconClass} strokeWidth={2} />
                          </>
                      ),
                  },
                  {
                      key: "create-channel",
                      onClick: () => onOpen("createChannel", { server }),
                      className: rowClass,
                      label: (
                          <>
                              Create Channel
                              <HugeiconsIcon icon={PlusSignIcon} className={iconClass} strokeWidth={2} />
                          </>
                      ),
                  },
              ]
            : []),
        { key: "sep-actions", type: "separator" as const },
        {
            key: "copy-invite",
            onClick: copyInvite,
            className: rowClass,
            label: (
                <>
                    Copy Invite Link
                    <HugeiconsIcon icon={Copy01Icon} className={iconClass} strokeWidth={2} />
                </>
            ),
        },
        ...(!isOwner
            ? [
                  { key: "sep-leave", type: "separator" as const },
                  {
                      key: "leave",
                      onClick: () => onOpen("leaveServer", { server }),
                      className: `${rowClass} text-pastelred hover:text-pastelred`,
                      label: (
                          <>
                              Leave Server
                              <HugeiconsIcon icon={Logout01Icon} className={iconClass} strokeWidth={2} />
                          </>
                      ),
                  },
              ]
            : []),
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
                    <HugeiconsIcon icon={ArrowDown01Icon} className="h-5 w-5 ml-auto" strokeWidth={2} />
                </>
            }
            items={items}
        />
    );
}
