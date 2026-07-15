"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import Link from "next/link";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import type { Area } from "react-easy-crop";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    Cancel01Icon,
    Copy01Icon,
    ArrowDown01Icon,
    ImageUploadIcon,
    RefreshIcon,
    Rocket01Icon,
    Tick02Icon,
} from "@hugeicons/core-free-icons";
import { Hash, Mic, Video } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
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
import type { CommunityChannel, CommunityServer } from "@/db/schema/community";

const SECTIONS = ["profile", "boosts", "members", "invites", "channels"] as const;
type Section = (typeof SECTIONS)[number];

const ROLES = ["ADMIN", "MODERATOR", "GUEST"] as const;
const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", MODERATOR: "Mod", GUEST: "Member" };
const channelTypeIcon = { TEXT: Hash, AUDIO: Mic, VIDEO: Video } as const;

// Full-screen server settings (the Discord anatomy, watchparty skin):
// grouped rail on the left, one section at a time on the right, ESC to
// leave. Admins get everything; mods skip Profile; guests are bounced.
export function ServerSettings({ serverId }: { serverId: string }) {
    const router = useRouter();
    const { data: session } = useAuthSession();
    const { onOpen } = useCommunityModal();
    const { data, isLoading } = trpc.community.getServer.useQuery({ serverId });

    const [section, setSection] = useQueryState(
        "s",
        parseAsStringLiteral(SECTIONS).withDefault("profile"),
    );

    const close = () => router.push(`/communities/${serverId}`);

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
    const isOwner = !!data && data.server.ownerId === session?.user?.id;

    // Guests have nothing to manage here.
    useEffect(() => {
        if (data && !isMod) router.replace(`/communities/${serverId}`);
    }, [data, isMod, router, serverId]);

    if (isLoading || !data || !isMod) {
        return (
            <div className="fixed inset-0 z-40 bg-background">
                <div className="mx-auto flex h-full w-full max-w-6xl gap-8 px-6 pt-20">
                    <div className="hidden w-60 shrink-0 flex-col gap-2 md:flex">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="h-10 overflow-hidden rounded-[14px]"><div className="size-full shimmer-skeleton" /></div>
                        ))}
                    </div>
                    <div className="flex-1 space-y-3 pt-1">
                        <div className="h-7 w-44 overflow-hidden rounded-full"><div className="size-full shimmer-skeleton" /></div>
                        <div className="h-32 overflow-hidden rounded-3xl"><div className="size-full shimmer-skeleton" /></div>
                    </div>
                </div>
            </div>
        );
    }

    const { server, channels, members, currentMember, boostCount, boostedByMe } = data;

    const nav: { group: string; rows: { key: Section; label: string }[] }[] = [
        {
            group: server.name,
            rows: [
                ...(isAdmin ? [{ key: "profile" as const, label: "Server profile" }] : []),
                { key: "boosts", label: "Boosts" },
            ],
        },
        {
            group: "People",
            rows: [
                { key: "members", label: "Members" },
                { key: "invites", label: "Invites" },
            ],
        },
        {
            group: "Channels",
            rows: [{ key: "channels", label: "Channels" }],
        },
    ];

    const active: Section = !isAdmin && section === "profile" ? "boosts" : section;

    return (
        <div className="fixed inset-0 z-40 bg-background">
            {/* Close (ESC) */}
            <div className="absolute right-5 top-5 z-10 flex flex-col items-center gap-1 md:right-8 md:top-8">
                <button
                    onClick={close}
                    aria-label="Close settings"
                    className="grid size-11 cursor-pointer place-items-center rounded-full bg-white/[0.06] text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-4" strokeWidth={2.5} />
                </button>
                <span className="text-[11px] font-bold text-zinc-600">ESC</span>
            </div>

            <div className="mx-auto flex h-full w-full max-w-6xl flex-col gap-4 px-5 pt-16 md:flex-row md:gap-10 md:px-8 md:pt-20">
                {/* Rail */}
                <nav className="flex w-full shrink-0 gap-1 overflow-x-auto pb-1 hidden-scrollbar md:w-60 md:flex-col md:overflow-y-auto md:overflow-x-visible md:pb-10">
                    {nav.map((g) => (
                        <div key={g.group} className="flex shrink-0 gap-1 md:mb-5 md:flex-col">
                            <p className="hidden truncate px-3 pb-1.5 text-[12px] font-bold text-zinc-500 md:block">{g.group}</p>
                            {g.rows.map((row) => (
                                <button
                                    key={row.key}
                                    onClick={() => setSection(row.key)}
                                    className={cn(
                                        "flex h-10 shrink-0 cursor-pointer items-center rounded-[14px] px-3 text-[14px] font-semibold transition-colors",
                                        active === row.key
                                            ? "bg-white/[0.07] text-white"
                                            : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200",
                                    )}
                                >
                                    {row.label}
                                </button>
                            ))}
                        </div>
                    ))}

                    {isOwner && (
                        <div className="shrink-0 md:mt-1 md:border-t md:border-white/5 md:pt-4">
                            <button
                                onClick={() => onOpen("deleteServer", { server })}
                                className="flex h-10 w-full shrink-0 cursor-pointer items-center rounded-[14px] px-3 text-[14px] font-semibold text-pastelred transition-colors hover:bg-pastelred/10"
                            >
                                Delete server
                            </button>
                        </div>
                    )}
                </nav>

                {/* Section */}
                <div className="min-w-0 flex-1 overflow-y-auto pb-16 hidden-scrollbar md:max-w-2xl">
                    {active === "profile" && isAdmin && <ProfileSection server={server} memberCount={members.length} />}
                    {active === "boosts" && <BoostsSection serverId={server.id} boostCount={boostCount} boostedByMe={boostedByMe} />}
                    {active === "members" && (
                        <MembersSection serverId={server.id} members={members} isAdmin={isAdmin} currentUserId={session?.user?.id} />
                    )}
                    {active === "invites" && <InvitesSection serverId={server.id} inviteCode={server.inviteCode} />}
                    {active === "channels" && <ChannelsSection server={server} channels={channels} role={currentMember.role} />}
                </div>
            </div>
        </div>
    );
}

function SectionHeader({ title, hint }: { title: string; hint: string }) {
    return (
        <div className="mb-6">
            <h1 className="text-[24px] font-bold tracking-tight text-white">{title}</h1>
            <p className="mt-0.5 text-[13px] font-medium text-zinc-500">{hint}</p>
        </div>
    );
}

// ─── Profile ─────────────────────────────────────────────

function ProfileSection({
    server,
    memberCount,
}: {
    server: CommunityServer;
    memberCount: number;
}) {
    const utils = trpc.useUtils();
    const [name, setName] = useState(server.name);
    const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [cropFile, setCropFile] = useState<File | null>(null);
    const cropStateRef = useRef<{ src: string; area: Area } | null>(null);

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();
    const updateServer = trpc.community.updateServer.useMutation();

    const previewSrc = iconDataUrl ?? server.imageUrl ?? null;
    const dirty = name.trim() !== server.name || !!iconDataUrl;

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
            <SectionHeader title="Server profile" hint="How your server shows up in invites and the rail." />

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
                    <p className="truncate text-[16px] font-bold tracking-tight text-white">{name.trim() || server.name}</p>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                        {memberCount} member{memberCount === 1 ? "" : "s"} · Est. {format(new Date(server.createdAt), "MMM yyyy")}
                    </p>
                </div>
            </div>

            {/* Name */}
            <div className="mb-7">
                <p className="mb-1.5 px-1 text-[13px] font-semibold text-zinc-500">Name</p>
                <Input
                    radius={14}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    className="h-12 text-[14px] font-semibold"
                />
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
            <SectionHeader title="Boosts" hint="Boosts are a signal of support from members." />

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

// ─── Members ─────────────────────────────────────────────

type Member = {
    id: string;
    role: string;
    userId: string;
    userName: string | null;
    userImage: string | null;
    userUsername: string | null;
};

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
    const utils = trpc.useUtils();
    const invalidate = () => utils.community.getServer.invalidate({ serverId });
    const updateRole = trpc.community.updateMemberRole.useMutation({ onSuccess: invalidate });
    const kickMember = trpc.community.kickMember.useMutation({ onSuccess: invalidate });

    return (
        <div>
            <SectionHeader
                title="Members"
                hint={`${members.length} ${members.length === 1 ? "person" : "people"} in this server.`}
            />

            <div className="space-y-0.5">
                {members.map((m) => {
                    const isSelf = m.userId === currentUserId;
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
            <SectionHeader title="Invites" hint="Anyone with this link can join your server." />

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
            <SectionHeader
                title="Channels"
                hint="Rename channels, make them read-only, or remove them. Drag to reorder from the sidebar."
            />

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
