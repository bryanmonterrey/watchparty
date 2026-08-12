"use client";

import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GooDropdown } from "@/components/ui/goo-dropdown";

// The Members/Roles shared row + its per-member moderation menu — extracted
// from server-settings.tsx (file-size guard), which is also where future
// member actions should land instead of growing that file again.

export type Member = {
    id: string;
    role: string;
    userId: string;
    userName: string | null;
    userImage: string | null;
    userUsername: string | null;
    createdAt: string | Date;
    roleIds?: string[];
    roleColor?: string | null;
    joinMethod?: string | null;
};

export type CustomRole = { id: string; name: string; color: string };

const ROLES = ["ADMIN", "MODERATOR", "GUEST"] as const;
const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", MODERATOR: "Mod", GUEST: "Member" };

export function MemberRow({
    serverId,
    m,
    customRoles = [],
    isAdmin,
    isSelf,
}: {
    serverId: string;
    m: Member;
    customRoles?: CustomRole[];
    isAdmin: boolean;
    isSelf: boolean;
}) {
    const utils = trpc.useUtils();
    const invalidate = () => utils.community.getServer.invalidate({ serverId });
    const updateRole = trpc.community.updateMemberRole.useMutation({ onSuccess: invalidate, onError: (err) => toast.error(err.message) });
    const kickMember = trpc.community.kickMember.useMutation({ onSuccess: invalidate, onError: (err) => toast.error(err.message) });
    const toggleCustomRole = trpc.community.toggleMemberRole.useMutation({ onSuccess: invalidate, onError: (err) => toast.error(err.message) });
    // Same timeout the bot MODERATE capability writes — one hour of muted-from-
    // posting, enforced in the send paths. GUESTs only (server-enforced too).
    const timeoutMember = trpc.communityModeration.timeoutMember.useMutation({
        onSuccess: (d) => {
            invalidate();
            toast.success(d.timeoutUntil ? `${m.userName ?? "Member"} timed out for an hour` : "Timeout cleared");
        },
        onError: (err) => toast.error(err.message),
    });
    const banMember = trpc.community.banMember.useMutation({
        onSuccess: () => {
            invalidate();
            utils.community.listBans.invalidate({ serverId });
            toast.success(`${m.userName ?? "Member"} banned`);
        },
        onError: (err) => toast.error(err.message),
    });
    const busy = updateRole.isPending || kickMember.isPending || banMember.isPending || toggleCustomRole.isPending || timeoutMember.isPending;

    return (
        <div className="flex items-center gap-3 rounded-[18px] px-2.5 py-2 transition-colors hover:bg-white/[0.04]">
            <Avatar className="size-11 shrink-0">
                <AvatarImage src={m.userImage || undefined} alt={m.userName || ""} />
                <AvatarFallback className="bg-white/10 text-[13px] font-bold text-zinc-300">
                    {(m.userName || "?")[0]?.toUpperCase()}
                </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-white" style={m.roleColor ? { color: m.roleColor } : undefined}>
                    {m.userName}{isSelf && <span className="ml-1.5 text-[12px] font-semibold text-zinc-500">you</span>}
                </p>
                <p className="truncate text-[13px] font-medium text-zinc-500">
                    @{m.userUsername || "user"} · joined {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
                    {m.joinMethod ? ` · via ${m.joinMethod === "discovery" ? "discovery" : "invite"}` : ""}
                </p>
            </div>

            {isAdmin && !isSelf ? (
                <GooDropdown
                    side="bottom"
                    align="end"
                    width={190}
                    gap={6}
                    buttonRadius={16}
                    triggerAriaLabel={`Manage ${m.userName}`}
                    triggerClassName={cn(
                        "flex h-9 cursor-pointer items-center gap-1 rounded-full bg-white/5 px-3.5 text-[13px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white",
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
                            onClick: () => updateRole.mutate({ serverId, memberId: m.id, role: r }),
                            className: "text-[13px] font-medium text-zinc-100 hover:bg-white/10",
                            label: <>Make {ROLE_LABEL[r]}</>,
                        })),
                        ...customRoles.map((r) => {
                            const has = m.roleIds?.includes(r.id);
                            return {
                                key: `custom-${r.id}`,
                                onClick: () => toggleCustomRole.mutate({ serverId, memberId: m.id, roleId: r.id }),
                                className: "text-[13px] font-medium text-zinc-100 hover:bg-white/10",
                                label: (
                                    <span className="flex w-full items-center gap-2">
                                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                                        <span className="min-w-0 flex-1 truncate">{r.name}</span>
                                        {has && <HugeiconsIcon icon={Tick02Icon} className="size-3.5 shrink-0 text-zinc-400" strokeWidth={2.5} />}
                                    </span>
                                ),
                            };
                        }),
                        // Timeout is GUEST-only server-side; hide it where it
                        // would only ever toast an error.
                        ...(m.role === "GUEST"
                            ? [
                                {
                                    key: "timeout",
                                    onClick: () => timeoutMember.mutate({ serverId, userId: m.userId, durationSeconds: 3600 }),
                                    className: "text-[13px] font-semibold text-pastelred hover:bg-pastelred/10",
                                    label: <>Timeout · 1 hour</>,
                                },
                                {
                                    key: "timeout-clear",
                                    onClick: () => timeoutMember.mutate({ serverId, userId: m.userId, durationSeconds: 0 }),
                                    className: "text-[13px] font-medium text-zinc-100 hover:bg-white/10",
                                    label: <>Clear timeout</>,
                                },
                            ]
                            : []),
                        {
                            key: "kick",
                            onClick: () => kickMember.mutate({ serverId, memberId: m.id }),
                            className: "text-[13px] font-semibold text-pastelred hover:bg-pastelred/10",
                            label: <>Kick from server</>,
                        },
                        {
                            key: "ban",
                            onClick: () => banMember.mutate({ serverId, memberId: m.id }),
                            className: "text-[13px] font-semibold text-pastelred hover:bg-pastelred/10",
                            label: <>Ban from server</>,
                        },
                    ]}
                />
            ) : (
                <span className={cn(
                    "shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold",
                    m.role === "ADMIN" ? "bg-white/15 text-white" : m.role === "MODERATOR" ? "bg-white/10 text-zinc-200" : "bg-white/5 text-zinc-500",
                )}>
                    {ROLE_LABEL[m.role] ?? m.role}
                </span>
            )}
        </div>
    );
}
