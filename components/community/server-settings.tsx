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
import { ADMIN_ONLY_SECTIONS, sectionLabel, useSettingsSection, type SettingsSection } from "./server-settings-nav";
import { ServerProfileCard, BANNER_COLORS, DEFAULT_BANNER, parseTraits } from "./server-profile-card";
import { Switch } from "@/components/ui/switch";
import { Squircle } from "@/components/ui/squircle";
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
        !isAdmin && ADMIN_ONLY_SECTIONS.includes(section) ? "engagement" : section;

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
            {/* Header — same bar anatomy as the chat header. Everything sits
                on the LEFT: the floating app header's wallet/create cluster
                owns the top-right of every page, so no controls live there. */}
            <div className="h-17 shrink-0 flex items-center gap-3 bg-black/50 backdrop-blur-xl w-full px-4">
                <span className="min-w-0 truncate font-semibold text-lg text-flexwhite leading-tight">
                    {sectionLabel(active)}
                </span>
                <button
                    onClick={() => router.push(`/communities/${serverId}`)}
                    aria-label="Close settings"
                    title="Close settings"
                    className="shrink-0 cursor-pointer rounded-[8px] bg-white/[0.06] px-2 py-1 text-[12px] font-bold tracking-wide text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                >
                    esc
                </button>
            </div>

            <ScrollArea className="flex-1">
                <div className={cn("p-6", active === "profile" ? "max-w-5xl" : "max-w-2xl")}>
                    {active === "profile" && isAdmin && <ProfileSection server={server} memberCount={members.length} />}
                    {active === "tag" && isAdmin && <TagSection server={server} />}
                    {active === "engagement" && <EngagementSection serverId={server.id} />}
                    {active === "boosts" && <BoostsSection serverId={server.id} boostCount={boostCount} boostedByMe={boostedByMe} />}
                    {active === "emoji" && <ExpressionsSection serverId={server.id} kind="emoji" />}
                    {active === "stickers" && <ExpressionsSection serverId={server.id} kind="sticker" />}
                    {active === "soundboard" && <SoundboardSection />}
                    {active === "members" && (
                        <MembersSection serverId={server.id} members={members} isAdmin={isAdmin} currentUserId={session?.user?.id} />
                    )}
                    {active === "roles" && (
                        <RolesSection serverId={server.id} members={members} isAdmin={isAdmin} currentUserId={session?.user?.id} />
                    )}
                    {active === "invites" && <InvitesSection serverId={server.id} inviteCode={server.inviteCode} />}
                    {active === "access" && isAdmin && <AccessSection server={server} channels={channels} />}
                    {active === "integrations" && <IntegrationsSection />}
                    {active === "apps" && <AppsSection />}
                    {active === "safety" && <SafetySection server={server} isAdmin={isAdmin} />}
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
    return <p className="mb-6 text-[14px] font-medium text-zinc-500">{children}</p>;
}

// Squircle action button for the settings surface (h-12, 15px bold).
function ActionButton({
    variant = "primary",
    className,
    children,
    ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "soft" }) {
    return (
        <Squircle asChild radius={16}>
            <button
                {...props}
                className={cn(
                    "inline-flex h-12 cursor-pointer items-center justify-center gap-2 px-6 text-[15px] font-bold transition-colors disabled:pointer-events-none disabled:opacity-40",
                    variant === "primary"
                        ? "bg-white text-black hover:bg-white/90"
                        : "bg-white/10 text-white hover:bg-white/20",
                    className,
                )}
            >
                {children}
            </button>
        </Squircle>
    );
}

// ─── Profile ─────────────────────────────────────────────

function ProfileSection({ server, memberCount }: { server: CommunityServer; memberCount: number }) {
    const utils = trpc.useUtils();
    const [name, setName] = useState(server.name);
    const [description, setDescription] = useState(server.description ?? "");
    const [bannerColor, setBannerColor] = useState(server.bannerColor ?? DEFAULT_BANNER);
    const [traits, setTraits] = useState<string[]>(parseTraits(server.traits));
    const [traitInput, setTraitInput] = useState("");
    const [privateProfile, setPrivateProfile] = useState(!!server.privateProfile);
    const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [cropFile, setCropFile] = useState<File | null>(null);
    const cropStateRef = useRef<{ src: string; area: Area } | null>(null);

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();
    const updateServer = trpc.community.updateServer.useMutation();

    const previewSrc = iconDataUrl ?? server.imageUrl ?? null;
    const traitsStr = traits.join(",");
    const dirty =
        name.trim() !== server.name ||
        !!iconDataUrl ||
        description.trim() !== (server.description ?? "") ||
        bannerColor !== (server.bannerColor ?? DEFAULT_BANNER) ||
        traitsStr !== (server.traits ?? "") ||
        privateProfile !== !!server.privateProfile;

    const addTrait = () => {
        const t = traitInput.replace(/,/g, "").trim().slice(0, 24);
        if (!t || traits.length >= 5 || traits.some((x) => x.toLowerCase() === t.toLowerCase())) return;
        setTraits((prev) => [...prev, t]);
        setTraitInput("");
    };

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
                description: description.trim() || null,
                bannerColor: bannerColor === DEFAULT_BANNER ? null : bannerColor,
                traits: traitsStr || null,
                privateProfile,
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
            <SectionHint>How your server shows up on invite links and around the app.</SectionHint>

            <div className="flex flex-col gap-8 xl:flex-row xl:items-start">
                {/* Form */}
                <div className="min-w-0 flex-1">
                    {/* Name */}
                    <div className="mb-6">
                        <p className="mb-1.5 px-1 text-[14px] font-semibold text-zinc-500">Name</p>
                        <Input
                            radius={14}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={100}
                            className="h-13 text-[15px] font-semibold"
                        />
                    </div>

                    {/* Icon */}
                    <div className="mb-7">
                        <p className="mb-1.5 px-1 text-[14px] font-semibold text-zinc-500">Icon</p>
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
                            <ActionButton variant="soft" onClick={() => fileInputRef.current?.click()}>
                                Change icon
                            </ActionButton>
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

                    {/* Banner color */}
                    <div className="mb-7">
                        <p className="mb-1.5 px-1 text-[14px] font-semibold text-zinc-500">Banner</p>
                        <div className="grid grid-cols-4 gap-2">
                            {BANNER_COLORS.map((c) => (
                                <button
                                    key={c.name}
                                    aria-label={`${c.name} banner`}
                                    title={c.name}
                                    onClick={() => setBannerColor(c.value)}
                                    className={cn(
                                        "h-14 cursor-pointer rounded-2xl transition-all",
                                        bannerColor === c.value && "ring-2 ring-white ring-offset-2 ring-offset-background",
                                    )}
                                    style={{ backgroundColor: c.value }}
                                />
                            ))}
                        </div>
                        <p className="mt-1.5 px-1 text-[13px] font-medium text-zinc-600">Flat color behind your icon on the profile card.</p>
                    </div>

                    {/* Traits */}
                    <div className="mb-7">
                        <p className="mb-1.5 px-1 text-[14px] font-semibold text-zinc-500">Traits</p>
                        {traits.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                                {traits.map((t) => (
                                    <span
                                        key={t}
                                        className="flex items-center gap-1.5 rounded-full bg-white/[0.06] py-1.5 pl-3 pr-1.5 text-[14px] font-semibold text-zinc-200"
                                    >
                                        {t}
                                        <button
                                            onClick={() => setTraits((prev) => prev.filter((x) => x !== t))}
                                            aria-label={`Remove ${t}`}
                                            className="grid size-5 cursor-pointer place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/10 hover:text-white"
                                        >
                                            <HugeiconsIcon icon={Cancel01Icon} className="size-2.5" strokeWidth={2.5} />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}
                        {traits.length < 5 && (
                            <div className="flex items-center gap-2">
                                <Input
                                    radius={14}
                                    value={traitInput}
                                    onChange={(e) => setTraitInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            addTrait();
                                        }
                                    }}
                                    placeholder="crypto, memes, movie nights…"
                                    maxLength={24}
                                    className="h-12 flex-1 text-[14px] font-semibold"
                                />
                                <ActionButton variant="soft" className="h-12 px-5" onClick={addTrait} disabled={!traitInput.trim()}>
                                    Add
                                </ActionButton>
                            </div>
                        )}
                        <p className="mt-1.5 px-1 text-[13px] font-medium text-zinc-600">
                            Up to 5 chips that show off your server&apos;s personality. {5 - traits.length} left.
                        </p>
                    </div>

                    {/* Description */}
                    <div className="mb-7">
                        <p className="mb-1.5 px-1 text-[14px] font-semibold text-zinc-500">Description</p>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Why should people join?"
                            rows={4}
                            maxLength={500}
                            className="w-full resize-none rounded-2xl bg-white/[0.04] px-4 py-3.5 text-[15px] font-medium text-white outline-none transition-colors placeholder:text-zinc-600 focus:bg-white/[0.06]"
                        />
                    </div>

                    {/* Private profile */}
                    <label className="mb-8 flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-bold text-white">Private profile</p>
                            <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                                Invite links show only your name and icon — no banner, description, traits, or member count.
                            </p>
                        </div>
                        <Switch checked={privateProfile} onCheckedChange={setPrivateProfile} disabled={saving} />
                    </label>

                    <ActionButton onClick={save} disabled={!dirty || !name.trim() || saving}>
                        {saving ? "Saving…" : "Save changes"}
                    </ActionButton>
                </div>

                {/* Live preview — exactly what an invite link shows */}
                <div className="w-full shrink-0 self-start xl:sticky xl:top-6 xl:w-80">
                    <p className="mb-2 px-1 text-[14px] font-semibold text-zinc-500">Invite preview</p>
                    <ServerProfileCard
                        name={name.trim() || server.name}
                        imageUrl={previewSrc}
                        tag={server.tag}
                        bannerColor={bannerColor}
                        description={description}
                        traits={traitsStr}
                        memberCount={memberCount}
                        createdAt={server.createdAt}
                        isPrivate={privateProfile}
                    />
                </div>
            </div>

            {cropFile && (
                <Dialog open onOpenChange={(o) => { if (!o) { setCropFile(null); cropStateRef.current = null; } }}>
                    <DialogContent className="rounded-4xl border-none p-6 sm:max-w-md" showCloseButton={false}>
                        <DialogTitle className="text-center text-[18px] font-bold tracking-tight text-white">Adjust your icon</DialogTitle>
                        <AvatarCropper
                            file={cropFile}
                            onAreaChange={(src, area) => { cropStateRef.current = { src, area }; }}
                        />
                        <p className="text-center text-[13px] font-medium text-zinc-500">Drag to reposition · scroll or slide to zoom</p>
                        <div className="mt-1 flex gap-2">
                            <ActionButton
                                variant="soft"
                                className="flex-1"
                                onClick={() => { setCropFile(null); cropStateRef.current = null; }}
                            >
                                Cancel
                            </ActionButton>
                            <ActionButton className="flex-1" onClick={applyCrop}>
                                Save
                            </ActionButton>
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
                                <p className="text-[26px] font-bold leading-tight tabular-nums tracking-tight text-white">
                                    {s.value.toLocaleString()}
                                </p>
                                <p className="mt-1 text-[13px] font-medium text-zinc-500">{s.label}</p>
                            </div>
                        ))}
                    </div>

                    <h2 className="mb-3 mt-8 text-[14px] font-semibold text-zinc-500">Top channels · 7d</h2>
                    {data.topChannels.length === 0 ? (
                        <div className="py-8 text-center">
                            <p className="text-[15px] font-bold text-zinc-400">Quiet week</p>
                            <p className="mt-0.5 text-[13px] font-medium text-zinc-600">No messages in the last 7 days</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {data.topChannels.map((c) => {
                                const Icon = channelTypeIcon[c.type];
                                return (
                                    <div key={c.channelId} className="flex items-center gap-3 rounded-[16px] px-3 py-2.5">
                                        <Icon className="size-4 shrink-0 text-zinc-500" />
                                        <p className="w-40 min-w-0 truncate text-[15px] font-semibold text-zinc-200">{c.name}</p>
                                        <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                                            <div
                                                className="h-full rounded-full bg-white/25"
                                                style={{ width: `${Math.max(4, (c.messages / maxMessages) * 100)}%` }}
                                            />
                                        </div>
                                        <p className="w-12 shrink-0 text-right text-[14px] font-bold tabular-nums text-zinc-400">
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
                        <p className="text-[26px] font-bold leading-tight tabular-nums tracking-tight text-white">{boostCount}</p>
                        <p className="text-[13px] font-medium text-zinc-500">boost{boostCount === 1 ? "" : "s"} on this server</p>
                    </div>
                </div>
                {boostedByMe && (
                    <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-bold text-white">
                        <HugeiconsIcon icon={Tick02Icon} className="size-3.5" strokeWidth={2.5} />
                        You boost this server
                    </span>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <ActionButton
                    variant={boostedByMe ? "soft" : "primary"}
                    onClick={() => toggleBoost.mutate({ serverId })}
                    disabled={toggleBoost.isPending}
                >
                    {boostedByMe ? "Remove your boost" : "Boost this server"}
                </ActionButton>
                <Link
                    href="/communities/shop"
                    className="flex h-12 items-center rounded-full px-4 text-[15px] font-bold text-zinc-400 transition-colors hover:text-white"
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
            <Avatar className="size-11 shrink-0">
                <AvatarImage src={m.userImage || undefined} alt={m.userName || ""} />
                <AvatarFallback className="bg-white/10 text-[13px] font-bold text-zinc-300">
                    {(m.userName || "?")[0]?.toUpperCase()}
                </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-white">
                    {m.userName}{isSelf && <span className="ml-1.5 text-[12px] font-semibold text-zinc-500">you</span>}
                </p>
                <p className="truncate text-[13px] font-medium text-zinc-500">@{m.userUsername || "user"}</p>
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
                            <h2 className="text-[15px] font-semibold text-zinc-300">
                                {ROLE_LABEL[role]}{group.length !== 1 ? "s" : ""}
                            </h2>
                            <span className="text-[12px] font-bold tabular-nums text-zinc-600">{group.length}</span>
                        </div>
                        <p className="mb-2 px-1 text-[13px] font-medium text-zinc-600">{ROLE_HINT[role]}</p>
                        {group.length === 0 ? (
                            <p className="rounded-[16px] bg-white/[0.02] px-3 py-3 text-[14px] font-medium text-zinc-600">Nobody yet</p>
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
                    className="h-13 flex-1 text-[14px] text-zinc-300"
                />
                <ActionButton
                    variant={copied ? "soft" : "primary"}
                    className="h-13 shrink-0 px-5"
                    onClick={onCopy}
                >
                    <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className="size-4" strokeWidth={2} />
                    {copied ? "Copied" : "Copy"}
                </ActionButton>
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
                    <p className="text-[15px] font-bold text-zinc-400">No bans</p>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-600">Ban members from their row in Members</p>
                </div>
            )}

            <div className="space-y-0.5">
                {bans.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 rounded-[18px] px-2.5 py-2 transition-colors hover:bg-white/[0.04]">
                        <Avatar className="size-11 shrink-0">
                            <AvatarImage src={b.userImage || undefined} alt={b.userName || ""} />
                            <AvatarFallback className="bg-white/10 text-[13px] font-bold text-zinc-300">
                                {(b.userName || "?")[0]?.toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[15px] font-bold text-white">{b.userName}</p>
                            <p className="truncate text-[13px] font-medium text-zinc-500">
                                Banned {formatDistanceToNow(new Date(b.createdAt), { addSuffix: true })}
                                {b.reason ? ` · ${b.reason}` : ""}
                            </p>
                        </div>
                        {isAdmin && (
                            <button
                                onClick={() => unban.mutate({ serverId, userId: b.userId })}
                                disabled={unban.isPending}
                                className="flex h-9 shrink-0 cursor-pointer items-center rounded-full bg-white/5 px-3.5 text-[13px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
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
                            <Icon className="size-5 shrink-0 text-zinc-500" />
                            <p className="min-w-0 flex-1 truncate text-[15px] font-semibold text-zinc-200">{c.name}</p>
                            {c.readOnly && (
                                <span className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[12px] font-bold text-zinc-400">
                                    <LockIcon className="size-3.5" />
                                    Read-only
                                </span>
                            )}
                            {!isGeneral && (
                                <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                        onClick={() => onOpen("editChannel", { channel: c, server })}
                                        className="flex h-9 cursor-pointer items-center rounded-full bg-white/5 px-3.5 text-[13px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        onClick={() => onOpen("deleteChannel", { channel: c, server })}
                                        className="flex h-9 cursor-pointer items-center rounded-full px-3.5 text-[13px] font-bold text-pastelred transition-colors hover:bg-pastelred/10"
                                    >
                                        Delete
                                    </button>
                                </div>
                            )}
                            {isGeneral && role && (
                                <LockIcon className="size-5 shrink-0 text-zinc-600" />
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

            <p className="mb-1.5 px-1 text-[14px] font-semibold text-zinc-500">Blocked words</p>
            <textarea
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="spam, scam link, another phrase"
                rows={5}
                maxLength={2000}
                className="w-full resize-none rounded-2xl bg-white/[0.04] px-4 py-3.5 text-[15px] font-medium text-white outline-none transition-colors placeholder:text-zinc-600 focus:bg-white/[0.06]"
            />
            <p className="mt-1.5 px-1 text-[13px] font-medium text-zinc-600">
                Separate words or phrases with commas. {wordCount > 0 ? `${wordCount} blocked.` : "Nothing blocked yet."}
            </p>

            <ActionButton
                className="mt-5"
                onClick={() => updateServer.mutate({ serverId: server.id, automodKeywords: keywords.trim() || null })}
                disabled={!dirty || updateServer.isPending}
            >
                {updateServer.isPending ? "Saving…" : "Save AutoMod"}
            </ActionButton>
        </div>
    );
}

// ─── Server tag ──────────────────────────────────────────

function TagSection({ server }: { server: CommunityServer }) {
    const utils = trpc.useUtils();
    const [tag, setTag] = useState(server.tag ?? "");
    const updateServer = trpc.community.updateServer.useMutation({
        onSuccess: () => {
            utils.community.getServer.invalidate({ serverId: server.id });
            toast.success("Server tag updated");
        },
        onError: () => toast.error("Update failed"),
    });

    const cleanTag = tag.trim().toUpperCase().slice(0, 8);
    const dirty = cleanTag !== (server.tag ?? "");

    return (
        <div>
            <SectionHint>A short badge shown next to your server name. Members can copy it from the name menu.</SectionHint>

            {/* Preview */}
            <div className="mb-7 flex items-center gap-3 rounded-3xl bg-white/[0.03] p-5">
                <p className="truncate text-[17px] font-bold tracking-tight text-white">{server.name}</p>
                {cleanTag ? (
                    <span className="shrink-0 rounded-[8px] bg-white/10 px-2 py-1 text-[12px] font-bold tracking-wide text-zinc-200">
                        {cleanTag}
                    </span>
                ) : (
                    <span className="shrink-0 text-[13px] font-medium text-zinc-600">no tag</span>
                )}
            </div>

            <p className="mb-1.5 px-1 text-[14px] font-semibold text-zinc-500">Tag</p>
            <Input
                radius={14}
                value={tag}
                onChange={(e) => setTag(e.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())}
                placeholder="STPA"
                maxLength={8}
                className="h-13 w-44 text-[15px] font-bold tracking-wide"
            />
            <p className="mt-1.5 px-1 text-[13px] font-medium text-zinc-600">Up to 8 letters or numbers. Clear it to remove the badge.</p>

            <ActionButton
                className="mt-5"
                onClick={() => updateServer.mutate({ serverId: server.id, tag: cleanTag || null })}
                disabled={!dirty || updateServer.isPending}
            >
                {updateServer.isPending ? "Saving…" : "Save tag"}
            </ActionButton>
        </div>
    );
}

// ─── Expressions (emoji + stickers) ──────────────────────

function ExpressionsSection({ serverId, kind }: { serverId: string; kind: "emoji" | "sticker" }) {
    const utils = trpc.useUtils();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [pendingPreview, setPendingPreview] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [uploading, setUploading] = useState(false);

    const { data: expressions = [], isLoading } = trpc.community.listExpressions.useQuery({ serverId });
    const items = expressions.filter((e) => e.kind === kind);

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();
    const addExpression = trpc.community.addExpression.useMutation();
    const deleteExpression = trpc.community.deleteExpression.useMutation({
        onSuccess: () => utils.community.listExpressions.invalidate({ serverId }),
    });

    const pickFile = (f: File) => {
        setPendingFile(f);
        setPendingPreview(URL.createObjectURL(f));
        setName(f.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32));
    };

    const clearPending = () => {
        if (pendingPreview) URL.revokeObjectURL(pendingPreview);
        setPendingFile(null);
        setPendingPreview(null);
        setName("");
    };

    const upload = async () => {
        if (!pendingFile || !/^[a-z0-9_]{2,32}$/.test(name) || uploading) return;
        setUploading(true);
        try {
            const ext = pendingFile.name.split(".").pop() || "png";
            const { token, path } = await getPresignedUrl.mutateAsync({
                bucket: "emotes",
                filename: `${kind}-${name}.${ext}`,
                contentType: pendingFile.type || "image/png",
            });
            const { data: up, error } = await supabase.storage.from("emotes").uploadToSignedUrl(path, token, pendingFile);
            if (error || !up) throw new Error("Upload failed");
            const imageUrl = supabase.storage.from("emotes").getPublicUrl(up.path).data.publicUrl;
            await addExpression.mutateAsync({ serverId, kind, name, imageUrl });
            utils.community.listExpressions.invalidate({ serverId });
            clearPending();
            toast.success(`:${name}: added`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const isEmoji = kind === "emoji";

    return (
        <div>
            <SectionHint>
                {isEmoji
                    ? "Custom emoji render inline when anyone types :name: in chat."
                    : "Stickers send as images from the sticker picker in the chat bar."}
            </SectionHint>

            {/* Upload */}
            {!pendingFile ? (
                <ActionButton className="mb-7" onClick={() => fileInputRef.current?.click()}>
                    <HugeiconsIcon icon={ImageUploadIcon} className="size-4" strokeWidth={2} />
                    Upload {isEmoji ? "emoji" : "sticker"}
                </ActionButton>
            ) : (
                <div className="mb-7 flex flex-wrap items-center gap-3 rounded-3xl bg-white/[0.03] p-4">
                    <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-[14px] bg-black4", isEmoji ? "size-12" : "size-20")}>
                        {pendingPreview && <img src={pendingPreview} alt="" className="size-full object-contain" />}
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        <span className="text-[14px] font-bold text-zinc-500">:</span>
                        <Input
                            radius={12}
                            value={name}
                            onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                            placeholder="name"
                            maxLength={32}
                            autoFocus
                            className="h-11 min-w-24 flex-1 text-[14px] font-bold"
                        />
                        <span className="text-[14px] font-bold text-zinc-500">:</span>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                        <ActionButton variant="soft" className="h-11 px-4 text-[14px]" onClick={clearPending}>
                            Cancel
                        </ActionButton>
                        <ActionButton
                            className="h-11 px-4 text-[14px]"
                            onClick={upload}
                            disabled={uploading || !/^[a-z0-9_]{2,32}$/.test(name)}
                        >
                            {uploading ? "Uploading…" : "Add"}
                        </ActionButton>
                    </div>
                </div>
            )}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) pickFile(f);
                    e.target.value = "";
                }}
            />

            {isLoading && (
                <div className={cn("grid gap-2", isEmoji ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-4")}>
                    {Array.from({ length: isEmoji ? 12 : 4 }).map((_, i) => (
                        <div key={i} className="aspect-square overflow-hidden rounded-2xl"><div className="size-full shimmer-skeleton" /></div>
                    ))}
                </div>
            )}

            {!isLoading && items.length === 0 && (
                <div className="py-10 text-center">
                    <p className="text-[15px] font-bold text-zinc-400">No {isEmoji ? "emoji" : "stickers"} yet</p>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-600">Upload the first one — every member gets to use it</p>
                </div>
            )}

            <div className={cn("grid gap-2", isEmoji ? "grid-cols-4 sm:grid-cols-6" : "grid-cols-2 sm:grid-cols-4")}>
                {items.map((e) => (
                    <div key={e.id} className="group relative flex flex-col items-center gap-1.5 rounded-2xl bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]">
                        <img src={e.imageUrl} alt={e.name} className={cn("object-contain", isEmoji ? "size-10" : "size-20")} />
                        <p className="w-full truncate text-center text-[12px] font-bold text-zinc-500">:{e.name}:</p>
                        <button
                            onClick={() => deleteExpression.mutate({ serverId, expressionId: e.id })}
                            disabled={deleteExpression.isPending}
                            aria-label={`Delete ${e.name}`}
                            className="absolute -right-1.5 -top-1.5 grid size-6 cursor-pointer place-items-center rounded-full bg-black4 text-zinc-400 opacity-0 ring-1 ring-white/10 transition-all hover:text-pastelred group-hover:opacity-100"
                        >
                            <HugeiconsIcon icon={Cancel01Icon} className="size-3" strokeWidth={2.5} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Soundboard ──────────────────────────────────────────

function SoundboardSection() {
    return (
        <div>
            <SectionHint>Short sounds members can play in voice channels.</SectionHint>
            <div className="rounded-3xl bg-white/[0.03] p-8 text-center">
                <p className="text-[16px] font-bold text-zinc-300">Arrives with voice rooms</p>
                <p className="mx-auto mt-1 max-w-xs text-[14px] font-medium leading-relaxed text-zinc-500">
                    The soundboard needs live voice under it. It unlocks when realtime voice ships.
                </p>
            </div>
        </div>
    );
}

// ─── Access ──────────────────────────────────────────────

function AccessSection({
    server,
    channels,
}: {
    server: CommunityServer;
    channels: (CommunityChannel & { unreadCount?: number })[];
}) {
    const utils = trpc.useUtils();
    const setPaused = trpc.community.setInvitesPaused.useMutation({
        onSuccess: (res) => {
            utils.community.getServer.invalidate({ serverId: server.id });
            toast.success(res.paused ? "Invites paused" : "Invites resumed");
        },
        onError: () => toast.error("Update failed"),
    });

    const readOnlyCount = channels.filter((c) => c.readOnly).length;

    return (
        <div>
            <SectionHint>Who can get in, and what they can touch once they&apos;re here.</SectionHint>

            <label className="mb-3 flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
                <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-white">Pause invites</p>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                        Nobody can join while paused — even with a valid link. Current members are unaffected.
                    </p>
                </div>
                <Switch
                    checked={!!server.invitesPaused}
                    onCheckedChange={(v) => setPaused.mutate({ serverId: server.id, paused: v })}
                    disabled={setPaused.isPending}
                />
            </label>

            <div className="rounded-3xl bg-white/[0.03] px-5 py-4">
                <p className="text-[15px] font-bold text-white">Read-only channels</p>
                <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                    {readOnlyCount === 0
                        ? "None — every channel is open to members. Make one read-only from Channels."
                        : `${readOnlyCount} channel${readOnlyCount === 1 ? "" : "s"} where only mods can post: ${channels.filter((c) => c.readOnly).map((c) => `#${c.name}`).join(", ")}`}
                </p>
            </div>
        </div>
    );
}

// ─── Apps ────────────────────────────────────────────────

function IntegrationsSection() {
    return (
        <div>
            <SectionHint>Services connected to this server.</SectionHint>
            <div className="rounded-3xl bg-white/[0.03] p-8 text-center">
                <p className="text-[16px] font-bold text-zinc-300">No integrations yet</p>
                <p className="mx-auto mt-1 max-w-xs text-[14px] font-medium leading-relaxed text-zinc-500">
                    Webhooks and connected services land here as the platform opens up.
                </p>
            </div>
        </div>
    );
}

function AppsSection() {
    return (
        <div>
            <SectionHint>Apps and bots you can add to this server.</SectionHint>
            <div className="rounded-3xl bg-white/[0.03] p-8 text-center">
                <p className="text-[16px] font-bold text-zinc-300">The app directory is coming</p>
                <p className="mx-auto mt-1 max-w-xs text-[14px] font-medium leading-relaxed text-zinc-500">
                    A home for server apps and bots once the developer platform opens.
                </p>
            </div>
        </div>
    );
}

// ─── Safety setup ────────────────────────────────────────

function SafetySection({ server, isAdmin }: { server: CommunityServer; isAdmin: boolean }) {
    const [, setSection] = useSettingsSection();
    const { data: bans = [] } = trpc.community.listBans.useQuery({ serverId: server.id });
    const automodCount = (server.automodKeywords ?? "").split(",").map((w) => w.trim()).filter(Boolean).length;

    const rows: { label: string; status: string; target: SettingsSection; show: boolean }[] = [
        {
            label: "Invites",
            status: server.invitesPaused ? "Paused — nobody can join" : "Open — anyone with the link can join",
            target: "access",
            show: isAdmin,
        },
        {
            label: "AutoMod",
            status: automodCount > 0 ? `${automodCount} blocked word${automodCount === 1 ? "" : "s"}` : "No blocked words",
            target: "automod",
            show: isAdmin,
        },
        {
            label: "Bans",
            status: bans.length > 0 ? `${bans.length} user${bans.length === 1 ? "" : "s"} banned` : "Nobody banned",
            target: "bans",
            show: true,
        },
        {
            label: "Audit log",
            status: "Every management action, tracked",
            target: "audit",
            show: true,
        },
    ];

    return (
        <div>
            <SectionHint>Your safety tools at a glance.</SectionHint>
            <div className="space-y-2">
                {rows.filter((r) => r.show).map((r) => (
                    <button
                        key={r.label}
                        onClick={() => setSection(r.target)}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 text-left transition-colors hover:bg-white/[0.06]"
                    >
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-bold text-white">{r.label}</p>
                            <p className="mt-0.5 truncate text-[13px] font-medium text-zinc-500">{r.status}</p>
                        </div>
                        <span className="shrink-0 text-[13px] font-bold text-zinc-500">Open</span>
                    </button>
                ))}
            </div>
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
                    <p className="text-[15px] font-bold text-zinc-400">Nothing logged yet</p>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-600">Channel, member, and server changes show up here</p>
                </div>
            )}

            <div className="space-y-0.5">
                {entries.map((e) => (
                    <div key={e.id} className="flex items-center gap-3 rounded-[16px] px-2.5 py-2 transition-colors hover:bg-white/[0.03]">
                        <Avatar className="size-9 shrink-0">
                            <AvatarImage src={e.actorImage || undefined} alt={e.actorName || ""} />
                            <AvatarFallback className="bg-white/10 text-[12px] font-bold text-zinc-300">
                                {(e.actorName || "?")[0]?.toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-zinc-300">
                            <span className="font-bold text-white">{e.actorName}</span> {e.detail ?? e.action}
                        </p>
                        <p className="shrink-0 text-[12px] font-medium text-zinc-600">
                            {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
