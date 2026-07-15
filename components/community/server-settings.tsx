"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import Link from "next/link";
import type { Area } from "react-easy-crop";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    ArrowDown01Icon,
    Cancel01Icon,
    Copy01Icon,
    ImageUploadIcon,
    RefreshIcon,
    Rocket01Icon,
    Tick02Icon,
} from "@hugeicons/core-free-icons";
import { Hash, Mic, Video } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { GooDropdown } from "@/components/ui/goo-dropdown";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { AvatarCropper, getCroppedDataUrl } from "@/components/file-upload/avatar-cropper";
import { LockIcon } from "@/components/icons";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { useAuthSession } from "@/hooks/use-auth-session";
import { trpc } from "@/lib/trpc/client";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { sectionLabel, useSettingsSection, type SettingsSection } from "./server-settings-nav";
import type { CommunityChannel, CommunityServer } from "@/db/schema/community";

const ROLES = ["ADMIN", "MODERATOR", "GUEST"] as const;
const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", MODERATOR: "Mod", GUEST: "Member" };
const channelTypeIcon = { TEXT: Hash, AUDIO: Mic, VIDEO: Video } as const;

// Server settings content column — lives where the chat area lives (the
// settings sidebar replaces the server sidebar via the communities layout).
// Chat-style header bar on top, one section at a time below, ESC leaves.
export function ServerSettings({ serverId }: { serverId: string }) {
    const router = useRouter();
    const { data: session } = useAuthSession();
    const { data, isLoading } = trpc.community.getServer.useQuery({ serverId });
    const [section] = useSettingsSection();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") router.push(`/communities/${serverId}`);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [router, serverId]);

    const role = data?.currentMember.role;
    const isAdmin = role === "ADMIN";
    const isMod = isAdmin || role === "MODERATOR";

    // Guests have nothing to manage here.
    useEffect(() => {
        if (data && !isMod) router.replace(`/communities/${serverId}`);
    }, [data, isMod, router, serverId]);

    const active: SettingsSection =
        !isAdmin && (section === "profile" || section === "automod") ? "engagement" : section;

    if (isLoading || !data || !isMod) {
        return (
            <div className="flex flex-col h-full min-w-0">
                <div className="h-17 shrink-0 flex items-center bg-black/50 backdrop-blur-xl px-4">
                    <div className="h-5 w-40 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                </div>
                <div className="flex-1 space-y-3 p-6">
                    <div className="h-28 max-w-2xl overflow-hidden rounded-3xl"><div className="size-full shimmer-skeleton" /></div>
                    <div className="h-12 max-w-2xl overflow-hidden rounded-2xl"><div className="size-full shimmer-skeleton" /></div>
                </div>
            </div>
        );
    }

    const { server, channels, members, currentMember, boostCount, boostedByMe } = data;

    return (
        <div className="flex flex-col h-full min-w-0">
            {/* Header — same bar anatomy as the chat header */}
            <div className="h-17 shrink-0 flex items-center bg-black/50 backdrop-blur-xl w-full px-4">
                <span className="font-semibold text-lg text-flexwhite truncate leading-tight">
                    {sectionLabel(active)}
                </span>
                <div className="ml-auto flex items-center gap-2">
                    <span className="hidden text-[11px] font-bold text-zinc-600 sm:block">ESC</span>
                    <button
                        onClick={() => router.push(`/communities/${serverId}`)}
                        aria-label="Close settings"
                        className="grid size-10 cursor-pointer place-items-center rounded-full text-flexwhite/40 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <HugeiconsIcon icon={Cancel01Icon} className="size-4" strokeWidth={2.5} />
                    </button>
                </div>
            </div>

            <ScrollArea className="flex-1">
                <div className="max-w-2xl p-6">
                    {active === "profile" && isAdmin && <ProfileSection server={server} memberCount={members.length} />}
                    {active === "engagement" && <EngagementSection serverId={server.id} />}
                    {active === "boosts" && <BoostsSection serverId={server.id} boostCount={boostCount} boostedByMe={boostedByMe} />}
                    {active === "members" && (
                        <MembersSection serverId={server.id} members={members} isAdmin={isAdmin} currentUserId={session?.user?.id} />
                    )}
                    {active === "roles" && (
                        <RolesSection serverId={server.id} members={members} isAdmin={isAdmin} currentUserId={session?.user?.id} />
                    )}
                    {active === "invites" && <InvitesSection serverId={server.id} inviteCode={server.inviteCode} />}
                    {active === "bans" && <BansSection serverId={server.id} isAdmin={isAdmin} />}
                    {active === "channels" && <ChannelsSection server={server} channels={channels} role={currentMember.role} />}
                    {active === "automod" && isAdmin && <AutomodSection server={server} />}
                    {active === "audit" && <AuditSection serverId={server.id} />}
                </div>
            </ScrollArea>
        </div>
    );
}

function SectionHint({ children }: { children: React.ReactNode }) {
    return <p className="mb-6 text-[13px] font-medium text-zinc-500">{children}</p>;
}

// ─── Profile ─────────────────────────────────────────────

function ProfileSection({ server, memberCount }: { server: CommunityServer; memberCount: number }) {
    const utils = trpc.useUtils();
    const [name, setName] = useState(server.name);
    const [tag, setTag] = useState(server.tag ?? "");
    const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [cropFile, setCropFile] = useState<File | null>(null);
    const cropStateRef = useRef<{ src: string; area: Area } | null>(null);

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();
    const updateServer = trpc.community.updateServer.useMutation();

    const previewSrc = iconDataUrl ?? server.imageUrl ?? null;
    const cleanTag = tag.trim().toUpperCase().slice(0, 8);
    const dirty = name.trim() !== server.name || !!iconDataUrl || cleanTag !== (server.tag ?? "");

    const applyCrop = async () => {
        const state = cropStateRef.current;
        if (!state) return;
        setIconDataUrl(await getCroppedDataUrl(state.src, state.area));
        setCropFile(null);
        cropStateRef.current = null;
    };

    const save = async () => {
        if (!dirty || !name.trim() || saving) return;
        setSaving(true);
        try {
            let imageUrl: string | undefined;
            if (iconDataUrl) {
                const blob = await (await fetch(iconDataUrl)).blob();
                const file = new File([blob], "server-icon.png", { type: "image/png" });
                const { token, path } = await getPresignedUrl.mutateAsync({
                    bucket: "avatars",
                    filename: "server-icon.png",
                    contentType: "image/png",
                });
                const { data: up, error } = await supabase.storage.from("avatars").uploadToSignedUrl(path, token, file);
                if (!error && up) {
                    imageUrl = supabase.storage.from("avatars").getPublicUrl(up.path).data.publicUrl;
                }
            }
            await updateServer.mutateAsync({
                serverId: server.id,
                name: name.trim(),
                tag: cleanTag || null,
                ...(imageUrl ? { imageUrl } : {}),
            });
            utils.community.listServers.invalidate();
            utils.community.getServer.invalidate({ serverId: server.id });
            setIconDataUrl(null);
            toast.success("Server updated");
        } catch {
            toast.error("Update failed");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div>
            <SectionHint>How your server shows up in invites, the rail, and the name menu.</SectionHint>

            {/* Preview card */}
            <div className="mb-8 flex items-center gap-4 rounded-3xl bg-white/[0.03] p-5">
                <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-[20px] bg-black4">
                    {previewSrc ? (
                        <img src={previewSrc} alt="" className="size-full object-cover" />
                    ) : (
                        <span className="text-[20px] font-bold text-white/90">{name.charAt(0).toUpperCase() || "?"}</span>
                    )}
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <p className="truncate text-[16px] font-bold tracking-tight text-white">{name.trim() || server.name}</p>
                        {cleanTag && (
                            <span className="shrink-0 rounded-[8px] bg-white/10 px-1.5 py-0.5 text-[11px] font-bold tracking-wide text-zinc-200">
                                {cleanTag}
                            </span>
                        )}
                    </div>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                        {memberCount} member{memberCount === 1 ? "" : "s"} · Est. {format(new Date(server.createdAt), "MMM yyyy")}
                    </p>
                </div>
            </div>

            {/* Name */}
            <div className="mb-6">
                <p className="mb-1.5 px-1 text-[13px] font-semibold text-zinc-500">Name</p>
                <Input
                    radius={14}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    className="h-12 text-[14px] font-semibold"
                />
            </div>

            {/* Tag */}
            <div className="mb-6">
                <p className="mb-1.5 px-1 text-[13px] font-semibold text-zinc-500">Server tag</p>
                <Input
                    radius={14}
                    value={tag}
                    onChange={(e) => setTag(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
                    placeholder="STPA"
                    maxLength={8}
                    className="h-12 w-40 text-[14px] font-bold tracking-wide"
                />
                <p className="mt-1.5 px-1 text-[12px] font-medium text-zinc-600">A short badge for your server, up to 8 characters. Leave empty for none.</p>
            </div>

            {/* Icon */}
            <div className="mb-8">
                <p className="mb-1.5 px-1 text-[13px] font-semibold text-zinc-500">Icon</p>
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className={cn(
                            "group relative grid size-20 cursor-pointer place-items-center overflow-hidden rounded-[24px] transition-colors",
                            previewSrc ? "" : "border border-dashed border-white/15 hover:border-white/30",
                        )}
                    >
                        {previewSrc ? (
                            <>
                                <img src={previewSrc} alt="" className="size-full object-cover" />
                                <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                                    <HugeiconsIcon icon={ImageUploadIcon} className="size-5 text-white" strokeWidth={2} />
                                </span>
                            </>
                        ) : (
                            <HugeiconsIcon icon={ImageUploadIcon} className="size-6 text-zinc-600 transition-colors group-hover:text-zinc-300" strokeWidth={2} />
                        )}
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex h-11 cursor-pointer items-center rounded-full bg-white/10 px-5 text-[13px] font-bold text-white transition-colors hover:bg-white/20"
                    >
                        Change icon
                    </button>
                </div>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setCropFile(f);
                        e.target.value = "";
                    }}
                />
            </div>

            <button
                onClick={save}
                disabled={!dirty || !name.trim() || saving}
                className="flex h-11 cursor-pointer items-center rounded-full bg-white px-6 text-[14px] font-bold text-black transition-colors hover:bg-white/90 disabled:pointer-events-none disabled:opacity-40"
            >
                {saving ? "Saving…" : "Save changes"}
            </button>

            {cropFile && (
                <Dialog open onOpenChange={(o) => { if (!o) { setCropFile(null); cropStateRef.current = null; } }}>
                    <DialogContent className="rounded-4xl border-none p-6 sm:max-w-md" showCloseButton={false}>
                        <DialogTitle className="text-center text-[18px] font-bold tracking-tight text-white">Adjust your icon</DialogTitle>
                        <AvatarCropper
                            file={cropFile}
                            onAreaChange={(src, area) => { cropStateRef.current = { src, area }; }}
                        />
                        <p className="text-center text-[12px] font-medium text-zinc-500">Drag to reposition · scroll or slide to zoom</p>
                        <div className="mt-1 flex gap-2">
                            <button
                                onClick={() => { setCropFile(null); cropStateRef.current = null; }}
                                className="h-12 flex-1 cursor-pointer rounded-full bg-white/5 text-[14px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={applyCrop}
                                className="h-12 flex-1 cursor-pointer rounded-full bg-white text-[14px] font-bold text-black transition-colors hover:bg-white/90"
                            >
                                Save
                            </button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}

// ─── Engagement ──────────────────────────────────────────

function EngagementSection({ serverId }: { serverId: string }) {
    const { data, isLoading } = trpc.community.getEngagement.useQuery({ serverId });

    const stats = data
        ? [
              { label: "Messages · 7d", value: data.messages7d },
              { label: "Active members · 7d", value: data.activeMembers7d },
              { label: "New members · 7d", value: data.newMembers7d },
              { label: "Total members", value: data.totalMembers },
          ]
        : [];
    const maxMessages = Math.max(1, ...(data?.topChannels.map((c) => c.messages) ?? [1]));

    return (
        <div>
            <SectionHint>How your server has been doing over the last week.</SectionHint>

            {isLoading && (
                <div className="grid grid-cols-2 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-24 overflow-hidden rounded-3xl"><div className="size-full shimmer-skeleton" /></div>
                    ))}
                </div>
            )}

            {data && (
                <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {stats.map((s) => (
                            <div key={s.label} className="rounded-3xl bg-white/[0.03] p-4">
                                <p className="text-[24px] font-bold leading-tight tabular-nums tracking-tight text-white">
                                    {s.value.toLocaleString()}
                                </p>
                                <p className="mt-1 text-[12px] font-medium text-zinc-500">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    <h2 className="mb-3 mt-8 text-[14px] font-semibold text-zinc-500">Top channels · 7d</h2>
                    {data.topChannels.length === 0 ? (
                        <div className="py-8 text-center">
                            <p className="text-[14px] font-bold text-zinc-400">Quiet week</p>
                            <p className="mt-0.5 text-[12px] font-medium text-zinc-600">No messages in the last 7 days</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {data.topChannels.map((c) => {
                                const Icon = channelTypeIcon[c.type];
                                return (
                                    <div key={c.channelId} className="flex items-center gap-3 rounded-[16px] px-3 py-2.5">
                                        <Icon className="size-4 shrink-0 text-zinc-500" />
                                        <p className="w-40 min-w-0 truncate text-[14px] font-semibold text-zinc-200">{c.name}</p>
                                        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                                            <div
                                                className="h-full rounded-full bg-white/25"
                                                style={{ width: `${Math.max(4, (c.messages / maxMessages) * 100)}%` }}
                                            />
                                        </div>
                                        <p className="w-12 shrink-0 text-right text-[13px] font-bold tabular-nums text-zinc-400">
                                            {c.messages.toLocaleString()}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Boosts ──────────────────────────────────────────────

function BoostsSection({
    serverId,
    boostCount,
    boostedByMe,
}: {
    serverId: string;
    boostCount: number;
    boostedByMe: boolean;
}) {
    const utils = trpc.useUtils();
    const balance = trpc.community.boostBalance.useQuery();
    const toggleBoost = trpc.community.toggleBoost.useMutation({
        onSuccess: () => {
            utils.community.getServer.invalidate({ serverId });
            utils.community.boostBalance.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });

    return (
        <div>
            <SectionHint>Boosts are a signal of support from members.</SectionHint>

            <div className="mb-6 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-3xl bg-white/[0.03] p-5">
                <div className="flex items-center gap-3.5">
                    <div className="grid size-12 shrink-0 place-items-center rounded-full bg-white/[0.06]">
                        <HugeiconsIcon icon={Rocket01Icon} className="size-5 text-white" strokeWidth={2} />
                    </div>
                    <div>
                        <p className="text-[24px] font-bold leading-tight tabular-nums tracking-tight text-white">{boostCount}</p>
                        <p className="text-[12px] font-medium text-zinc-500">boost{boostCount === 1 ? "" : "s"} on this server</p>
                    </div>
                </div>
                {boostedByMe && (
                    <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-bold text-white">
                        <HugeiconsIcon icon={Tick02Icon} className="size-3.5" strokeWidth={2.5} />
                        You boost this server
                    </span>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <button
                    onClick={() => toggleBoost.mutate({ serverId })}
                    disabled={toggleBoost.isPending}
                    className={cn(
                        "flex h-11 cursor-pointer items-center gap-2 rounded-full px-6 text-[14px] font-bold transition-colors disabled:pointer-events-none disabled:opacity-40",
                        boostedByMe
                            ? "bg-white/10 text-white hover:bg-white/20"
                            : "bg-white text-black hover:bg-white/90",
                    )}
                >
                    {boostedByMe ? "Remove your boost" : "Boost this server"}
                </button>
                <Link
                    href="/communities/shop"
                    className="flex h-11 items-center rounded-full px-4 text-[13px] font-bold text-zinc-400 transition-colors hover:text-white"
                >
                    {balance.data ? `${balance.data.available} boost${balance.data.available === 1 ? "" : "s"} available · Shop` : "Shop"}
                </Link>
            </div>
        </div>
    );
}

// ─── Members / Roles (shared row) ────────────────────────

type Member = {
    id: string;
    role: string;
    userId: string;
    userName: string | null;
    userImage: string | null;
    userUsername: string | null;
};

function MemberRow({
    serverId,
    m,
    isAdmin,
    isSelf,
}: {
    serverId: string;
    m: Member;
    isAdmin: boolean;
    isSelf: boolean;
}) {
    const utils = trpc.useUtils();
    const invalidate = () => utils.community.getServer.invalidate({ serverId });
    const updateRole = trpc.community.updateMemberRole.useMutation({ onSuccess: invalidate });
    const kickMember = trpc.community.kickMember.useMutation({ onSuccess: invalidate });
    const banMember = trpc.community.banMember.useMutation({
        onSuccess: () => {
            invalidate();
            utils.community.listBans.invalidate({ serverId });
            toast.success(`${m.userName ?? "Member"} banned`);
        },
    });
    const busy = updateRole.isPending || kickMember.isPending || banMember.isPending;

    return (
        <div className="flex items-center gap-3 rounded-[18px] px-2.5 py-2 transition-colors hover:bg-white/[0.04]">
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
                    width={190}
                    gap={6}
                    fill="#101011"
                    buttonRadius={16}
                    panelRadius={16}
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
                            onClick: () => updateRole.mutate({ serverId, memberId: m.id, role: r }),
                            className: "text-[13px] font-medium text-zinc-100 hover:bg-white/10",
                            label: <>Make {ROLE_LABEL[r]}</>,
                        })),
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
                    "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                    m.role === "ADMIN" ? "bg-white/15 text-white" : m.role === "MODERATOR" ? "bg-white/10 text-zinc-200" : "bg-white/5 text-zinc-500",
                )}>
                    {ROLE_LABEL[m.role] ?? m.role}
                </span>
            )}
        </div>
    );
}

function MembersSection({
    serverId,
    members,
    isAdmin,
    currentUserId,
}: {
    serverId: string;
    members: Member[];
    isAdmin: boolean;
    currentUserId?: string;
}) {
    return (
        <div>
            <SectionHint>{members.length} {members.length === 1 ? "person" : "people"} in this server. Bans stop rejoining; kicks don&apos;t.</SectionHint>
            <div className="space-y-0.5">
                {members.map((m) => (
                    <MemberRow key={m.userId} serverId={serverId} m={m} isAdmin={isAdmin} isSelf={m.userId === currentUserId} />
                ))}
            </div>
        </div>
    );
}

function RolesSection({
    serverId,
    members,
    isAdmin,
    currentUserId,
}: {
    serverId: string;
    members: Member[];
    isAdmin: boolean;
    currentUserId?: string;
}) {
    const ROLE_HINT: Record<string, string> = {
        ADMIN: "Full control — settings, roles, bans, channels",
        MODERATOR: "Manage channels, pins, and invites",
        GUEST: "Chat and join voice",
    };

    return (
        <div>
            <SectionHint>Three roles, clear powers. Change a member&apos;s role from their row.</SectionHint>
            {ROLES.map((role) => {
                const group = members.filter((m) => m.role === role);
                return (
                    <div key={role} className="mb-7">
                        <div className="mb-1 flex items-baseline gap-2 px-1">
                            <h2 className="text-[14px] font-semibold text-zinc-300">
                                {ROLE_LABEL[role]}{group.length !== 1 ? "s" : ""}
                            </h2>
                            <span className="text-[12px] font-bold tabular-nums text-zinc-600">{group.length}</span>
                        </div>
                        <p className="mb-2 px-1 text-[12px] font-medium text-zinc-600">{ROLE_HINT[role]}</p>
                        {group.length === 0 ? (
                            <p className="rounded-[16px] bg-white/[0.02] px-3 py-3 text-[13px] font-medium text-zinc-600">Nobody yet</p>
                        ) : (
                            <div className="space-y-0.5">
                                {group.map((m) => (
                                    <MemberRow key={m.userId} serverId={serverId} m={m} isAdmin={isAdmin} isSelf={m.userId === currentUserId} />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Invites ─────────────────────────────────────────────

function InvitesSection({ serverId, inviteCode }: { serverId: string; inviteCode: string }) {
    const [copied, setCopied] = useState(false);
    const utils = trpc.useUtils();
    const generateInvite = trpc.community.generateInviteCode.useMutation({
        onSuccess: () => utils.community.getServer.invalidate({ serverId }),
    });

    const inviteUrl = typeof window !== "undefined"
        ? `${window.location.origin}/communities/invite/${inviteCode}`
        : "";

    const onCopy = () => {
        navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div>
            <SectionHint>Anyone with this link can join your server — unless they&apos;re banned.</SectionHint>

            <div className="flex items-center gap-2">
                <Input
                    radius={14}
                    readOnly
                    value={inviteUrl}
                    onFocus={(e) => e.target.select()}
                    className="h-12 flex-1 text-[13px] text-zinc-300"
                />
                <button
                    onClick={onCopy}
                    className={cn(
                        "flex h-12 shrink-0 cursor-pointer items-center gap-2 rounded-full px-5 text-[14px] font-bold transition-colors",
                        copied ? "bg-white/10 text-white" : "bg-white text-black hover:bg-white/90",
                    )}
                >
                    <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className="size-4" strokeWidth={2} />
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>

            <button
                onClick={() => generateInvite.mutate({ serverId })}
                disabled={generateInvite.isPending}
                className="mt-4 flex cursor-pointer items-center gap-1.5 rounded-full py-1.5 text-[12px] font-semibold text-zinc-500 transition-colors hover:text-white disabled:opacity-50"
            >
                <HugeiconsIcon icon={RefreshIcon} className={cn("size-3.5", generateInvite.isPending && "animate-spin")} strokeWidth={2} />
                Generate a new link — the old one stops working
            </button>
        </div>
    );
}

// ─── Bans ────────────────────────────────────────────────

function BansSection({ serverId, isAdmin }: { serverId: string; isAdmin: boolean }) {
    const utils = trpc.useUtils();
    const { data: bans = [], isLoading } = trpc.community.listBans.useQuery({ serverId });
    const unban = trpc.community.unbanMember.useMutation({
        onSuccess: () => utils.community.listBans.invalidate({ serverId }),
    });

    return (
        <div>
            <SectionHint>Banned users can&apos;t rejoin, even with a fresh invite link.</SectionHint>

            {isLoading && (
                <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-14 overflow-hidden rounded-[18px]"><div className="size-full shimmer-skeleton" /></div>
                    ))}
                </div>
            )}

            {!isLoading && bans.length === 0 && (
                <div className="py-10 text-center">
                    <p className="text-[14px] font-bold text-zinc-400">No bans</p>
                    <p className="mt-0.5 text-[12px] font-medium text-zinc-600">Ban members from their row in Members</p>
                </div>
            )}

            <div className="space-y-0.5">
                {bans.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 rounded-[18px] px-2.5 py-2 transition-colors hover:bg-white/[0.04]">
                        <Avatar className="size-10 shrink-0">
                            <AvatarImage src={b.userImage || undefined} alt={b.userName || ""} />
                            <AvatarFallback className="bg-white/10 text-[13px] font-bold text-zinc-300">
                                {(b.userName || "?")[0]?.toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-bold text-white">{b.userName}</p>
                            <p className="truncate text-[12px] font-medium text-zinc-500">
                                Banned {formatDistanceToNow(new Date(b.createdAt), { addSuffix: true })}
                                {b.reason ? ` · ${b.reason}` : ""}
                            </p>
                        </div>
                        {isAdmin && (
                            <button
                                onClick={() => unban.mutate({ serverId, userId: b.userId })}
                                disabled={unban.isPending}
                                className="flex h-8 shrink-0 cursor-pointer items-center rounded-full bg-white/5 px-3 text-[12px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
                            >
                                Revoke ban
                            </button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Channels ────────────────────────────────────────────

function ChannelsSection({
    server,
    channels,
    role,
}: {
    server: CommunityServer;
    channels: (CommunityChannel & { unreadCount?: number })[];
    role: string;
}) {
    const { onOpen } = useCommunityModal();

    return (
        <div>
            <SectionHint>Rename channels, make them read-only, or remove them. Drag to reorder from the sidebar.</SectionHint>

            <div className="space-y-0.5">
                {channels.map((c) => {
                    const Icon = channelTypeIcon[c.type];
                    const isGeneral = c.name === "general";
                    return (
                        <div key={c.id} className="group flex items-center gap-3 rounded-[18px] px-3 py-2.5 transition-colors hover:bg-white/[0.04]">
                            <Icon className="size-4.5 shrink-0 text-zinc-500" />
                            <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-zinc-200">{c.name}</p>
                            {c.readOnly && (
                                <span className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-bold text-zinc-400">
                                    <LockIcon className="size-3.5" />
                                    Read-only
                                </span>
                            )}
                            {!isGeneral && (
                                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                        onClick={() => onOpen("editChannel", { channel: c, server })}
                                        className="flex h-8 cursor-pointer items-center rounded-full bg-white/5 px-3 text-[12px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => onOpen("deleteChannel", { channel: c, server })}
                                        className="flex h-8 cursor-pointer items-center rounded-full px-3 text-[12px] font-bold text-pastelred transition-colors hover:bg-pastelred/10"
                                    >
                                        Delete
                                    </button>
                                </div>
                            )}
                            {isGeneral && role && (
                                <LockIcon className="size-4.5 shrink-0 text-zinc-600" />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── AutoMod ─────────────────────────────────────────────

function AutomodSection({ server }: { server: CommunityServer }) {
    const utils = trpc.useUtils();
    const [keywords, setKeywords] = useState(server.automodKeywords ?? "");
    const updateServer = trpc.community.updateServer.useMutation({
        onSuccess: () => {
            utils.community.getServer.invalidate({ serverId: server.id });
            toast.success("AutoMod updated");
        },
        onError: () => toast.error("Update failed"),
    });

    const dirty = keywords !== (server.automodKeywords ?? "");
    const wordCount = keywords.split(",").map((w) => w.trim()).filter(Boolean).length;

    return (
        <div>
            <SectionHint>Messages from members containing a blocked word are rejected before they post. Mods and admins are exempt.</SectionHint>

            <p className="mb-1.5 px-1 text-[13px] font-semibold text-zinc-500">Blocked words</p>
            <textarea
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="spam, scam link, another phrase"
                rows={5}
                maxLength={2000}
                className="w-full resize-none rounded-2xl bg-white/[0.04] px-4 py-3.5 text-[14px] font-medium text-white outline-none transition-colors placeholder:text-zinc-600 focus:bg-white/[0.06]"
            />
            <p className="mt-1.5 px-1 text-[12px] font-medium text-zinc-600">
                Separate words or phrases with commas. {wordCount > 0 ? `${wordCount} blocked.` : "Nothing blocked yet."}
            </p>

            <button
                onClick={() => updateServer.mutate({ serverId: server.id, automodKeywords: keywords.trim() || null })}
                disabled={!dirty || updateServer.isPending}
                className="mt-5 flex h-11 cursor-pointer items-center rounded-full bg-white px-6 text-[14px] font-bold text-black transition-colors hover:bg-white/90 disabled:pointer-events-none disabled:opacity-40"
            >
                {updateServer.isPending ? "Saving…" : "Save AutoMod"}
            </button>
        </div>
    );
}

// ─── Audit log ───────────────────────────────────────────

function AuditSection({ serverId }: { serverId: string }) {
    const { data: entries = [], isLoading } = trpc.community.getAuditLog.useQuery({ serverId });

    return (
        <div>
            <SectionHint>Every management action on this server, newest first.</SectionHint>

            {isLoading && (
                <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-12 overflow-hidden rounded-[16px]"><div className="size-full shimmer-skeleton" /></div>
                    ))}
                </div>
            )}

            {!isLoading && entries.length === 0 && (
                <div className="py-10 text-center">
                    <p className="text-[14px] font-bold text-zinc-400">Nothing logged yet</p>
                    <p className="mt-0.5 text-[12px] font-medium text-zinc-600">Channel, member, and server changes show up here</p>
                </div>
            )}

            <div className="space-y-0.5">
                {entries.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 rounded-[16px] px-2.5 py-2 transition-colors hover:bg-white/[0.03]">
                        <Avatar className="size-8 shrink-0">
                            <AvatarImage src={e.actorImage || undefined} alt={e.actorName || ""} />
                            <AvatarFallback className="bg-white/10 text-[11px] font-bold text-zinc-300">
                                {(e.actorName || "?")[0]?.toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-300">
                            <span className="font-bold text-white">{e.actorName}</span> {e.detail ?? e.action}
                        </p>
                        <p className="shrink-0 text-[11px] font-medium text-zinc-600">
                            {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
