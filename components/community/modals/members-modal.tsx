"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { useAuthSession } from "@/hooks/use-auth-session";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";

const ROLES = ["ADMIN", "MODERATOR", "GUEST"] as const;
const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", MODERATOR: "Mod", GUEST: "Member" };

// Members — roster with role chips; admins manage roles / kick through a
// per-row menu (server API enforces permissions again).
export function MembersModal() {
    const { isOpen, onClose, type, data } = useCommunityModal();
    const { data: session } = useAuthSession();
    const utils = trpc.useUtils();

    const isModalOpen = isOpen && type === "members";
    const serverId = data.server?.id;

    const { data: serverData, isLoading } = trpc.community.getServer.useQuery(
        { serverId: serverId! },
        { enabled: isModalOpen && !!serverId },
    );
    const members = serverData?.members ?? [];
    const myRole = serverData?.currentMember?.role;
    const isAdmin = myRole === "ADMIN";

    const invalidate = () => serverId && utils.community.getServer.invalidate({ serverId });
    const updateRole = trpc.community.updateMemberRole.useMutation({ onSuccess: invalidate });
    const kickMember = trpc.community.kickMember.useMutation({ onSuccess: invalidate });

    return (
        <Dialog open={isModalOpen} onOpenChange={onClose}>
            <DialogContent className="gap-4 rounded-4xl border-none p-6 sm:max-w-[440px]" showCloseButton={false}>
                <div className="text-center">
                    <DialogTitle className="text-[18px] font-bold tracking-tight text-white">Members</DialogTitle>
                    <p className="mt-1 text-[13px] font-medium text-zinc-500">
                        {members.length} {members.length === 1 ? "person" : "people"} in {data.server?.name ?? "this server"}
                    </p>
                </div>

                <div className="h-[320px] space-y-0.5 overflow-y-auto hidden-scrollbar">
                    {isLoading && (
                        <div className="flex flex-col gap-2 pt-1">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 px-2 py-2">
                                    <div className="size-10 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                                    <div className="h-3.5 w-1/3 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                                </div>
                            ))}
                        </div>
                    )}

                    {!isLoading && members.map((m) => {
                        const isSelf = m.userId === session?.user?.id;
                        const busy = updateRole.isPending || kickMember.isPending;
                        return (
                            <div key={m.userId} className="flex items-center gap-3 rounded-[18px] px-2.5 py-2 transition-colors hover:bg-white/[0.04]">
                                <Avatar className="size-10 shrink-0">
                                    <AvatarImage src={m.userImage || undefined} alt={m.userName || ""} />
                                    <AvatarFallback className="bg-white/10 text-[13px] font-bold text-zinc-300">
                                        {(m.userName || "?")[0]?.toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[14px] font-bold text-white">
                                        {m.userName}{isSelf && <span className="ml-1.5 text-[11px] font-semibold text-zinc-500">you</span>}
                                    </p>
                                    <p className="truncate text-[12px] font-medium text-zinc-500">@{m.userUsername || "user"}</p>
                                </div>

                                {isAdmin && !isSelf ? (
                                    <GooDropdown
                                        side="bottom"
                                        align="end"
                                        width={180}
                                        gap={6}
                                        buttonRadius={16}
                                        triggerAriaLabel={`Manage ${m.userName}`}
                                        triggerClassName={cn(
                                            "flex h-8 cursor-pointer items-center gap-1 rounded-full bg-white/5 px-3 text-[12px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white",
                                            busy && "opacity-50 pointer-events-none",
                                        )}
                                        trigger={
                                            <>
                                                {ROLE_LABEL[m.role] ?? m.role}
                                                <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-zinc-500" strokeWidth={2} />
                                            </>
                                        }
                                        items={[
                                            ...ROLES.filter((r) => r !== m.role).map((r) => ({
                                                key: r,
                                                onClick: () => serverId && updateRole.mutate({ serverId, memberId: m.id, role: r }),
                                                className: "text-[13px] font-medium text-zinc-100 hover:bg-white/10",
                                                label: <>Make {ROLE_LABEL[r]}</>,
                                            })),
                                            {
                                                key: "kick",
                                                onClick: () => serverId && kickMember.mutate({ serverId, memberId: m.id }),
                                                className: "text-[13px] font-semibold text-pastelred hover:bg-pastelred/10",
                                                label: <>Kick from server</>,
                                            },
                                        ]}
                                    />
                                ) : (
                                    <span className={cn(
                                        "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                                        m.role === "ADMIN" ? "bg-white/15 text-white" : m.role === "MODERATOR" ? "bg-white/10 text-zinc-200" : "bg-white/5 text-zinc-500",
                                    )}>
                                        {ROLE_LABEL[m.role] ?? m.role}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}
