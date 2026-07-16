"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    ArrowDown01Icon,
    Copy01Icon,
    IdIcon,
    Logout01Icon,
    Notification01Icon,
    NotificationOff01Icon,
    PencilEdit01Icon,
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
    muted?: boolean;
};

// Server name menu (the full Discord anatomy): boost + tag on top, member
// actions, notifications, per-server profile, the one red action, and copy
// rows last. Owners manage/delete through Server Settings.
export function CommunityServerHeader({ server, role, boostCount = 0, boostedByMe = false, muted = false }: Props) {
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
    const setMuted = trpc.community.setServerMuted.useMutation({
        onSuccess: (res) => {
            utils.community.getServer.invalidate({ serverId: server.id });
            utils.community.listServers.invalidate();
            toast.success(res.muted ? "Server muted" : "Server unmuted");
        },
    });

    const isAdmin = role === "ADMIN";
    const isModerator = isAdmin || role === "MODERATOR";
    const isOwner = server.ownerId === session?.user?.id;

    const rowClass = "px-3 text-sm cursor-pointer text-neutral-400 font-medium hover:bg-zinc-800 hover:text-neutral-200";
    const iconClass = "h-4 w-4 ml-auto";

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
        // Server tag: copy it; admins without one get a shortcut to set it.
        ...(server.tag
            ? [
                  {
                      key: "tag",
                      onClick: () => {
                          navigator.clipboard.writeText(server.tag!);
                          toast.success("Server tag copied");
                      },
                      className: rowClass,
                      label: (
                          <>
                              Server Tag
                              <span className="ml-auto rounded-[8px] bg-white/10 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-zinc-200">
                                  {server.tag}
                              </span>
                          </>
                      ),
                  },
              ]
            : isAdmin
              ? [
                    {
                        key: "tag-set",
                        onClick: () => router.push(`/communities/${server.id}/settings?s=profile`),
                        className: rowClass,
                        label: (
                            <>
                                Set Server Tag
                                <HugeiconsIcon icon={IdIcon} className={iconClass} strokeWidth={2} />
                            </>
                        ),
                    },
                ]
              : []),
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
        { key: "sep-notify", type: "separator" as const },
        {
            key: "mute",
            onClick: () => setMuted.mutate({ serverId: server.id, muted: !muted }),
            className: rowClass,
            label: (
                <>
                    {muted ? "Unmute Server" : "Mute Server"}
                    <HugeiconsIcon icon={muted ? Notification01Icon : NotificationOff01Icon} className={iconClass} strokeWidth={2} />
                </>
            ),
        },
        {
            key: "nickname",
            onClick: () => onOpen("nickname", { server }),
            className: rowClass,
            label: (
                <>
                    Edit Server Profile
                    <HugeiconsIcon icon={PencilEdit01Icon} className={iconClass} strokeWidth={2} />
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
        { key: "sep-copy", type: "separator" as const },
        {
            key: "copy-invite",
            onClick: () => {
                navigator.clipboard.writeText(`${window.location.origin}/communities/invite/${server.inviteCode}`);
                toast.success("Invite link copied");
            },
            className: rowClass,
            label: (
                <>
                    Copy Invite Link
                    <HugeiconsIcon icon={Copy01Icon} className={iconClass} strokeWidth={2} />
                </>
            ),
        },
        {
            key: "copy-id",
            onClick: () => {
                navigator.clipboard.writeText(server.id);
                toast.success("Server ID copied");
            },
            className: rowClass,
            label: (
                <>
                    Copy Server ID
                    <HugeiconsIcon icon={IdIcon} className={iconClass} strokeWidth={2} />
                </>
            ),
        },
    ];

    return (
        <GooDropdown
            className="w-full"
            align="start"
            width={232}
            itemHeight={36}
            buttonRadius={0}
            fill="#18181b"
            triggerClassName="w-full text-md cursor-pointer font-semibold px-3 py-4.5 flex items-center hover:bg-zinc-900 transition text-white"
            trigger={
                <>
                    <span className="truncate">{server.name}</span>
                    {server.tag && (
                        <span
                            className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-[8px] bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-zinc-300"
                            style={server.tagColor ? { backgroundColor: `${server.tagColor}26`, color: server.tagColor } : undefined}
                        >
                            {server.tagBadge && <span className="text-[10px] leading-none">{server.tagBadge}</span>}
                            {server.tag}
                        </span>
                    )}
                    <HugeiconsIcon icon={ArrowDown01Icon} className="h-5 w-5 ml-auto shrink-0" strokeWidth={2} />
                </>
            }
            items={items}
        />
    );
}
