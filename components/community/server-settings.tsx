"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BotsPanel } from "@/components/community/server-settings-bots";
import { MemberRow, type Member, type CustomRole } from "@/components/community/server-settings-member-row";
import { format, formatDistanceToNow, isPast } from "date-fns";
import Link from "next/link";
import type { Area } from "react-easy-crop";
import { HugeiconsIcon } from "@hugeicons/react";
import {
    ArrowDown01Icon,
    AudioWave01Icon,
    Cancel01Icon,
    Copy01Icon,
    FileAudioIcon,
    ImageUploadIcon,
    PlayIcon,
    PlusSignIcon,
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
import { BOOST_LEVELS, boostLevelFor, nextBoostLevel } from "@/lib/premium/boost-levels";
import { cn } from "@/lib/utils";
import { ADMIN_ONLY_SECTIONS, SETTINGS_SECTIONS, sectionLabel, useSettingsSection, type SettingsSection } from "./server-settings-nav";
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
    const [section, setSection] = useSettingsSection();

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

    const { server, channels, members, currentMember, roles, boostCount, boostedByMe } = data;

    return (
        <div className="flex flex-col h-full min-w-0">
            {/* Header — same bar anatomy as the chat header. Everything sits
                on the LEFT: the floating app header's wallet/create cluster
                owns the top-right of every page, so no controls live there. */}
            <div className="h-17 shrink-0 flex items-center gap-3 bg-black/50 backdrop-blur-xl w-full px-4">
                {/* Phone: the settings rail is hidden, so the title becomes
                    the section switcher */}
                <GooDropdown
                    side="bottom"
                    align="start"
                    width={210}
                    gap={6}
                    buttonRadius={16}
                    triggerAriaLabel="Switch settings section"
                    triggerClassName="flex min-w-0 cursor-pointer items-center gap-1.5 md:hidden"
                    trigger={
                        <>
                            <span className="min-w-0 truncate font-semibold text-lg text-flexwhite leading-tight">
                                {sectionLabel(active)}
                            </span>
                            <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 shrink-0 text-zinc-500" strokeWidth={2} />
                        </>
                    }
                    items={SETTINGS_SECTIONS
                        .filter((s) => isAdmin || !ADMIN_ONLY_SECTIONS.includes(s))
                        .map((s) => ({
                            key: s,
                            onClick: () => setSection(s),
                            className: cn(
                                "text-[14px] font-medium hover:bg-white/10",
                                s === active ? "text-white font-semibold" : "text-zinc-300",
                            ),
                            label: <>{sectionLabel(s)}</>,
                        }))}
                />
                <span className="min-w-0 truncate font-semibold text-lg text-flexwhite leading-tight max-md:hidden">
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
                    {active === "profile" && isAdmin && <ProfileSection server={server} memberCount={members.length} boostCount={boostCount} />}
                    {active === "tag" && isAdmin && <TagSection server={server} />}
                    {active === "engagement" && <EngagementSection server={server} channels={channels} isAdmin={isAdmin} />}
                    {active === "boosts" && <BoostsSection server={server} boostCount={boostCount} boostedByMe={boostedByMe} isAdmin={isAdmin} />}
                    {active === "emoji" && <ExpressionsSection serverId={server.id} kind="emoji" boostCount={boostCount} />}
                    {active === "stickers" && <ExpressionsSection serverId={server.id} kind="sticker" boostCount={boostCount} />}
                    {active === "soundboard" && <SoundboardSection serverId={server.id} boostCount={boostCount} />}
                    {active === "members" && (
                        <MembersSection serverId={server.id} members={members} customRoles={roles} isAdmin={isAdmin} currentUserId={session?.user?.id} />
                    )}
                    {active === "roles" && (
                        <RolesSection serverId={server.id} members={members} customRoles={roles} isAdmin={isAdmin} currentUserId={session?.user?.id} />
                    )}
                    {active === "invites" && <InvitesSection server={server} isAdmin={isAdmin} />}
                    {active === "access" && isAdmin && <AccessSection server={server} channels={channels} />}
                    {active === "integrations" && (
                        <IntegrationsSection serverId={server.id} channels={channels} canManage={currentMember.role !== "GUEST"} isAdmin={isAdmin} />
                    )}
                    {active === "apps" && <AppsSection />}
                    {active === "safety" && <SafetySection server={server} isAdmin={isAdmin} />}
                    {active === "bans" && <BansSection serverId={server.id} isAdmin={isAdmin} />}
                    {active === "channels" && <ChannelsSection server={server} channels={channels} role={currentMember.role} />}
                    {active === "automod" && isAdmin && <AutomodSection server={server} />}
                    {active === "audit" && <AuditSection serverId={server.id} />}
                    {active === "template" && isAdmin && <TemplateSection server={server} />}
                </div>
            </ScrollArea>
        </div>
    );
}

function SectionHint({ children }: { children: React.ReactNode }) {
    return <p className="mb-6 text-[14px] font-medium text-zinc-500">{children}</p>;
}

/**
 * updateServer with an optimistic cache patch: toggles and pickers flip the
 * moment they're clicked instead of waiting a mutation + refetch round-trip
 * (which read as multi-second lag). Input keys match `server` columns, so
 * the patch is a shallow merge of the defined keys; errors roll back.
 */
function useUpdateServer(serverId: string) {
    const utils = trpc.useUtils();
    return trpc.community.updateServer.useMutation({
        onMutate: async (input) => {
            await utils.community.getServer.cancel({ serverId });
            const prev = utils.community.getServer.getData({ serverId });
            if (prev) {
                const patch = Object.fromEntries(
                    Object.entries(input).filter(([k, v]) => k !== "serverId" && v !== undefined),
                ) as Partial<CommunityServer>;
                utils.community.getServer.setData({ serverId }, { ...prev, server: { ...prev.server, ...patch } });
            }
            return { prev };
        },
        onError: (err, _input, ctx) => {
            if (ctx?.prev) utils.community.getServer.setData({ serverId }, ctx.prev);
            toast.error(err.message);
        },
        // Reconcile with the server's canonical row (e.g. trimmed/uppercased fields)
        onSettled: () => utils.community.getServer.invalidate({ serverId }),
    });
}

/** setInvitesPaused with the same optimistic treatment. */
function useSetInvitesPaused(serverId: string) {
    const utils = trpc.useUtils();
    return trpc.community.setInvitesPaused.useMutation({
        onMutate: async ({ paused }) => {
            await utils.community.getServer.cancel({ serverId });
            const prev = utils.community.getServer.getData({ serverId });
            if (prev) {
                utils.community.getServer.setData({ serverId }, { ...prev, server: { ...prev.server, invitesPaused: paused } });
            }
            return { prev };
        },
        onError: (err, _input, ctx) => {
            if (ctx?.prev) utils.community.getServer.setData({ serverId }, ctx.prev);
            toast.error(err.message);
        },
        onSettled: () => utils.community.getServer.invalidate({ serverId }),
    });
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

function ProfileSection({ server, memberCount, boostCount }: { server: CommunityServer; memberCount: number; boostCount: number }) {
    const utils = trpc.useUtils();
    const [name, setName] = useState(server.name);
    const [description, setDescription] = useState(server.description ?? "");
    const [bannerColor, setBannerColor] = useState(server.bannerColor ?? DEFAULT_BANNER);
    // Banner image (boost perk): existing URL, a fresh data: URL, or null
    const [bannerImage, setBannerImage] = useState<string | null>(server.bannerImageUrl ?? null);
    const [traits, setTraits] = useState<string[]>(parseTraits(server.traits));
    const [traitInput, setTraitInput] = useState("");
    const [privateProfile, setPrivateProfile] = useState(!!server.privateProfile);
    const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bannerInputRef = useRef<HTMLInputElement>(null);
    const [cropFile, setCropFile] = useState<File | null>(null);
    const cropStateRef = useRef<{ src: string; area: Area } | null>(null);

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();
    const updateServer = trpc.community.updateServer.useMutation();

    const bannerUnlocked = boostLevelFor(boostCount).bannerImage;

    const previewSrc = iconDataUrl ?? server.imageUrl ?? null;
    const traitsStr = traits.join(",");
    const dirty =
        name.trim() !== server.name ||
        !!iconDataUrl ||
        description.trim() !== (server.description ?? "") ||
        bannerColor !== (server.bannerColor ?? DEFAULT_BANNER) ||
        bannerImage !== (server.bannerImageUrl ?? null) ||
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
            // Fresh banner upload (data: URL) → banners bucket → public URL
            let bannerImageUrl: string | null | undefined =
                bannerImage === (server.bannerImageUrl ?? null) ? undefined : bannerImage;
            if (bannerImage?.startsWith("data:")) {
                const blob = await (await fetch(bannerImage)).blob();
                const file = new File([blob], "server-banner.png", { type: blob.type || "image/png" });
                const { token, path } = await getPresignedUrl.mutateAsync({
                    bucket: "banners",
                    filename: "server-banner.png",
                    contentType: file.type,
                });
                const { data: up, error } = await supabase.storage.from("banners").uploadToSignedUrl(path, token, file);
                if (error || !up) throw error ?? new Error("banner upload failed");
                bannerImageUrl = supabase.storage.from("banners").getPublicUrl(up.path).data.publicUrl;
            }

            await updateServer.mutateAsync({
                serverId: server.id,
                name: name.trim(),
                description: description.trim() || null,
                bannerColor: bannerColor === DEFAULT_BANNER ? null : bannerColor,
                traits: traitsStr || null,
                privateProfile,
                ...(imageUrl ? { imageUrl } : {}),
                ...(bannerImageUrl !== undefined ? { bannerImageUrl } : {}),
            });
            utils.community.listServers.invalidate();
            utils.community.getServer.invalidate({ serverId: server.id });
            setIconDataUrl(null);
            if (bannerImageUrl !== undefined) setBannerImage(bannerImageUrl);
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
                                    onClick={() => { setBannerColor(c.value); setBannerImage(null); }}
                                    className={cn(
                                        "h-14 cursor-pointer rounded-2xl transition-all",
                                        !bannerImage && bannerColor === c.value && "ring-2 ring-white ring-offset-2 ring-offset-background",
                                    )}
                                    style={{ backgroundColor: c.value }}
                                />
                            ))}
                        </div>
                        <p className="mt-1.5 px-1 text-[13px] font-medium text-zinc-600">Flat color behind your icon on the profile card.</p>

                        {/* Banner image — boost level 1+ perk */}
                        <div className="mt-3">
                            {bannerUnlocked ? (
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        onClick={() => bannerInputRef.current?.click()}
                                        className={cn(
                                            "group relative h-14 w-full max-w-55 cursor-pointer overflow-hidden rounded-2xl transition-all",
                                            bannerImage
                                                ? "ring-2 ring-white ring-offset-2 ring-offset-background"
                                                : "border border-dashed border-white/15 hover:border-white/30",
                                        )}
                                    >
                                        {bannerImage ? (
                                            <>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={bannerImage} alt="" className="size-full object-cover" />
                                                <span className="absolute inset-0 grid place-items-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                                                    <HugeiconsIcon icon={ImageUploadIcon} className="size-4 text-white" strokeWidth={2} />
                                                </span>
                                            </>
                                        ) : (
                                            <span className="flex size-full items-center justify-center gap-2 text-[13px] font-semibold text-zinc-500 transition-colors group-hover:text-zinc-300">
                                                <HugeiconsIcon icon={ImageUploadIcon} className="size-4" strokeWidth={2} />
                                                Upload a banner image
                                            </span>
                                        )}
                                    </button>
                                    {bannerImage && (
                                        <button
                                            onClick={() => setBannerImage(null)}
                                            className="cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-semibold text-zinc-500 transition-colors hover:text-white"
                                        >
                                            Remove image
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <p className="flex items-center gap-1.5 px-1 text-[13px] font-medium text-zinc-600">
                                    <LockIcon className="size-3.5 shrink-0" />
                                    Banner images unlock at boost level 1 — 2 boosts.
                                </p>
                            )}
                            <input
                                ref={bannerInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) {
                                        const reader = new FileReader();
                                        reader.onload = () => setBannerImage(reader.result as string);
                                        reader.readAsDataURL(f);
                                    }
                                    e.target.value = "";
                                }}
                            />
                        </div>
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
                        bannerImageUrl={bannerImage}
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

function EngagementSection({
    server,
    channels,
    isAdmin,
}: {
    server: CommunityServer;
    channels: (CommunityChannel & { unreadCount?: number })[];
    isAdmin: boolean;
}) {
    const serverId = server.id;
    const utils = trpc.useUtils();
    const { data, isLoading } = trpc.community.getEngagement.useQuery({ serverId });
    const updateServer = useUpdateServer(serverId);

    const textChannels = channels.filter((c) => c.type === "TEXT");
    const systemChannel =
        textChannels.find((c) => c.id === server.systemChannelId) ??
        textChannels.find((c) => c.name === "general") ??
        textChannels[0];

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

            {/* System messages — announcements that keep the server feeling alive */}
            {isAdmin && (
                <>
                    <h2 className="mb-3 mt-9 text-[14px] font-semibold text-zinc-500">System messages</h2>
                    <div className="space-y-2">
                        <label className="flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
                            <div className="min-w-0 flex-1">
                                <p className="text-[15px] font-bold text-white">Welcome messages</p>
                                <p className="mt-0.5 text-[13px] font-medium text-zinc-500">Announce when someone joins the server.</p>
                            </div>
                            <Switch
                                checked={server.welcomeMessages !== false}
                                onCheckedChange={(v) => updateServer.mutate({ serverId, welcomeMessages: v })}
                            />
                        </label>

                        <label className="flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
                            <div className="min-w-0 flex-1">
                                <p className="text-[15px] font-bold text-white">Boost messages</p>
                                <p className="mt-0.5 text-[13px] font-medium text-zinc-500">Announce when someone boosts the server.</p>
                            </div>
                            <Switch
                                checked={server.boostMessages !== false}
                                onCheckedChange={(v) => updateServer.mutate({ serverId, boostMessages: v })}
                            />
                        </label>

                        <div className="flex flex-wrap items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4">
                            <div className="min-w-0 flex-1">
                                <p className="text-[15px] font-bold text-white">Announcements channel</p>
                                <p className="mt-0.5 text-[13px] font-medium text-zinc-500">Where join and boost messages post.</p>
                            </div>
                            <GooDropdown
                                side="bottom"
                                align="end"
                                width={220}
                                gap={6}
                                buttonRadius={16}
                                triggerAriaLabel="Announcements channel"
                                triggerClassName={cn(
                                    "flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-white/5 px-4 text-[14px] font-bold text-zinc-200 transition-colors hover:bg-white/10 hover:text-white",
                                    updateServer.isPending && "pointer-events-none opacity-50",
                                )}
                                trigger={
                                    <>
                                        #{systemChannel?.name ?? "general"}
                                        <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-zinc-500" strokeWidth={2} />
                                    </>
                                }
                                items={textChannels.map((c) => ({
                                    key: c.id,
                                    onClick: () => updateServer.mutate({ serverId, systemChannelId: c.id }),
                                    className: "text-[14px] font-medium text-zinc-100 hover:bg-white/10",
                                    label: <>#{c.name}</>,
                                }))}
                            />
                        </div>
                    </div>

                    {/* Default notifications — what lights up the rail badge */}
                    <h2 className="mb-3 mt-9 text-[14px] font-semibold text-zinc-500">Default notifications</h2>
                    <div className="space-y-2">
                        {([
                            { key: "all" as const, label: "All messages", hint: "The unread pill lights up for any new message" },
                            { key: "mentions" as const, label: "Only @mentions", hint: "The rail stays quiet unless someone mentions a member" },
                        ]).map((opt) => {
                            const selected = (server.defaultNotifications ?? "all") === opt.key;
                            return (
                                <button
                                    key={opt.key}
                                    onClick={() => updateServer.mutate({ serverId, defaultNotifications: opt.key })}
                                    className={cn(
                                        "flex w-full cursor-pointer items-center gap-3 rounded-3xl px-5 py-4 text-left transition-colors",
                                        selected ? "bg-white/[0.08]" : "bg-white/[0.03] hover:bg-white/[0.05]",
                                    )}
                                >
                                    <span className={cn(
                                        "grid size-5 shrink-0 place-items-center rounded-full border-2",
                                        selected ? "border-white" : "border-zinc-600",
                                    )}>
                                        {selected && <span className="size-2.5 rounded-full bg-white" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className={cn("block text-[15px] font-bold", selected ? "text-white" : "text-zinc-300")}>{opt.label}</span>
                                        <span className="mt-0.5 block text-[13px] font-medium text-zinc-500">{opt.hint}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Activity feed */}
                    <h2 className="mb-3 mt-9 text-[14px] font-semibold text-zinc-500">Activity</h2>
                    <label className="flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-bold text-white">Active now</p>
                            <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                                Show recently active members at the top of the channel list.
                            </p>
                        </div>
                        <Switch
                            checked={!!server.activityFeed}
                            onCheckedChange={(v) => updateServer.mutate({ serverId, activityFeed: v })}
                        />
                    </label>

                    {/* Inactive voice channel */}
                    <div className="mt-3 rounded-3xl bg-white/[0.03] px-5 py-4">
                        <p className="text-[15px] font-bold text-white">Inactive channel</p>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            Members idle in voice longer than the timeout get disconnected automatically.
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <GooDropdown
                                side="top"
                                align="start"
                                width={190}
                                gap={6}
                                buttonRadius={16}
                                triggerAriaLabel="Inactive timeout"
                                triggerClassName={cn(
                                    "flex h-11 cursor-pointer items-center gap-1.5 rounded-full bg-white/5 px-4 text-[13px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white",
                                    updateServer.isPending && "pointer-events-none opacity-50",
                                )}
                                trigger={<>
                                    {server.inactiveTimeoutMinutes ? `After ${server.inactiveTimeoutMinutes} min` : "Off"}
                                    <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-zinc-500" strokeWidth={2} />
                                </>}
                                items={[
                                    { label: "Off", v: null },
                                    { label: "5 minutes", v: 5 },
                                    { label: "15 minutes", v: 15 },
                                    { label: "30 minutes", v: 30 },
                                    { label: "1 hour", v: 60 },
                                ].map((o) => ({
                                    key: o.label,
                                    onClick: () => updateServer.mutate({ serverId, inactiveTimeoutMinutes: o.v }),
                                    className: "text-[13px] font-medium text-zinc-100 hover:bg-white/10",
                                    label: <>{o.label}</>,
                                }))}
                            />
                        </div>
                    </div>

                    {/* Server widget */}
                    <h2 className="mb-3 mt-9 text-[14px] font-semibold text-zinc-500">Server widget</h2>
                    <label className="flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-bold text-white">Enable server widget</p>
                            <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                                A public embed for your own site: name, member count, who&apos;s online, and a join button.
                            </p>
                        </div>
                        <Switch
                            checked={!!server.widgetEnabled}
                            onCheckedChange={(v) => updateServer.mutate({ serverId, widgetEnabled: v })}
                        />
                    </label>
                    {server.widgetEnabled && <WidgetSnippet serverId={serverId} />}
                </>
            )}
        </div>
    );
}

// The copy-paste iframe snippet shown once the widget is enabled.
function WidgetSnippet({ serverId }: { serverId: string }) {
    const [copied, setCopied] = useState(false);
    const snippet = `<iframe src="${typeof window !== "undefined" ? window.location.origin : "https://watchparty.xyz"}/widget/${serverId}" width="360" height="260" frameborder="0" title="watchparty server"></iframe>`;

    return (
        <div className="mt-3 rounded-3xl bg-white/[0.03] px-5 py-4">
            <div className="flex items-center justify-between gap-3">
                <p className="text-[14px] font-semibold text-zinc-500">Embed code</p>
                <button
                    onClick={() => {
                        void navigator.clipboard.writeText(snippet);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                    }}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 text-[12px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                    <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className="size-3" strokeWidth={2} />
                    {copied ? "Copied" : "Copy"}
                </button>
            </div>
            <pre className="mt-2 overflow-x-auto rounded-2xl bg-black/40 p-3.5 text-[12px] font-medium leading-relaxed text-zinc-400">
                {snippet}
            </pre>
        </div>
    );
}

// ─── Boosts ──────────────────────────────────────────────

function BoostsSection({
    server,
    boostCount,
    boostedByMe,
    isAdmin,
}: {
    server: CommunityServer;
    boostCount: number;
    boostedByMe: boolean;
    isAdmin: boolean;
}) {
    const serverId = server.id;
    const utils = trpc.useUtils();
    const balance = trpc.community.boostBalance.useQuery();
    const toggleBoost = trpc.community.toggleBoost.useMutation({
        onSuccess: () => {
            utils.community.getServer.invalidate({ serverId });
            utils.community.boostBalance.invalidate();
        },
        onError: (err) => toast.error(err.message),
    });
    const updateServer = useUpdateServer(serverId);
    const [vanity, setVanity] = useState(server.customInvite ?? "");

    const level = boostLevelFor(boostCount);
    const next = nextBoostLevel(boostCount);
    const progress = next
        ? Math.min(1, (boostCount - level.threshold) / (next.threshold - level.threshold))
        : 1;

    return (
        <div>
            <SectionHint>Boosts unlock perks for everyone — more emoji and sticker slots, and a banner image.</SectionHint>

            <div className="mb-4 rounded-3xl bg-white/[0.03] p-5">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                    <div className="flex items-center gap-3.5">
                        <div className="grid size-12 shrink-0 place-items-center rounded-full bg-white/[0.06]">
                            <HugeiconsIcon icon={Rocket01Icon} className="size-5 text-white" strokeWidth={2} />
                        </div>
                        <div>
                            <p className="text-[26px] font-bold leading-tight tabular-nums tracking-tight text-white">{boostCount}</p>
                            <p className="text-[13px] font-medium text-zinc-500">boost{boostCount === 1 ? "" : "s"} · level {level.level}</p>
                        </div>
                    </div>
                    {boostedByMe && (
                        <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[13px] font-bold text-white">
                            <HugeiconsIcon icon={Tick02Icon} className="size-3.5" strokeWidth={2.5} />
                            You boost this server
                        </span>
                    )}
                </div>

                {/* Progress to the next level */}
                <div className="mt-5">
                    <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-white transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
                    </div>
                    <p className="mt-1.5 text-[13px] font-medium text-zinc-500">
                        {next
                            ? `${next.threshold - boostCount} more boost${next.threshold - boostCount === 1 ? "" : "s"} to level ${next.level}`
                            : "Max level — every perk is unlocked"}
                    </p>
                </div>
            </div>

            {/* Perk ladder */}
            <div className="mb-6 space-y-2">
                {BOOST_LEVELS.map((l) => {
                    const unlocked = level.level >= l.level;
                    return (
                        <div
                            key={l.level}
                            className={cn(
                                "flex items-center gap-3 rounded-3xl px-5 py-4",
                                unlocked ? "bg-white/[0.05]" : "bg-white/[0.02]",
                            )}
                        >
                            <div className="min-w-0 flex-1">
                                <p className={cn("text-[15px] font-bold", unlocked ? "text-white" : "text-zinc-500")}>
                                    Level {l.level}
                                    {l.threshold > 0 && <span className="ml-2 text-[12px] font-semibold text-zinc-600">{l.threshold} boosts</span>}
                                </p>
                                <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                                    {l.emojiSlots} emoji slots · {l.stickerSlots} sticker slots{l.bannerImage && l.level === 1 ? " · banner image" : ""}
                                </p>
                            </div>
                            {unlocked ? (
                                <HugeiconsIcon icon={Tick02Icon} className="size-4 shrink-0 text-lantern" strokeWidth={2.5} />
                            ) : (
                                <LockIcon className="size-4 shrink-0 text-zinc-600" />
                            )}
                        </div>
                    );
                })}
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

            {isAdmin && (
                <>
                    {/* Boost progress bar in the channel sidebar */}
                    <label className="mt-8 flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-bold text-white">Show boost progress bar</p>
                            <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                                Members see progress to the next level at the top of the channel list.
                            </p>
                        </div>
                        <Switch
                            checked={!!server.showBoostBar}
                            onCheckedChange={(v) => updateServer.mutate({ serverId, showBoostBar: v })}
                        />
                    </label>

                    {/* Custom invite link — level 3 perk */}
                    <div className="mt-3 rounded-3xl bg-white/[0.03] px-5 py-4">
                        <div className="flex items-center gap-2">
                            <p className="text-[15px] font-bold text-white">Custom invite link</p>
                            {level.level < 3 && <LockIcon className="size-3.5 shrink-0 text-zinc-600" />}
                        </div>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            {level.level >= 3
                                ? "A memorable link that never changes — it works alongside the regular invite."
                                : "Unlocks at boost level 3 (14 boosts)."}
                        </p>
                        {level.level >= 3 && (
                            <div className="mt-3 flex items-center gap-2">
                                <span className="shrink-0 text-[14px] font-semibold text-zinc-500">/communities/invite/</span>
                                <Input
                                    radius={14}
                                    value={vanity}
                                    onChange={(e) => setVanity(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                                    placeholder="your-server"
                                    maxLength={24}
                                    className="h-12 flex-1 text-[14px] font-semibold"
                                />
                                <ActionButton
                                    variant="soft"
                                    className="h-12 shrink-0 px-5"
                                    onClick={() => updateServer.mutate({ serverId, customInvite: vanity.trim() || null })}
                                    disabled={updateServer.isPending || vanity === (server.customInvite ?? "") || (vanity !== "" && vanity.length < 3)}
                                >
                                    Save
                                </ActionButton>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Members / Roles (shared row) ────────────────────────
// MemberRow + Member/CustomRole moved to server-settings-member-row.tsx
// (file-size guard) — new member actions land THERE, not here.

const MEMBER_SORTS = ["Newest", "Oldest", "A–Z"] as const;
type MemberSort = (typeof MEMBER_SORTS)[number];

function MembersSection({
    serverId,
    members,
    customRoles,
    isAdmin,
    currentUserId,
}: {
    serverId: string;
    members: Member[];
    customRoles: CustomRole[];
    isAdmin: boolean;
    currentUserId?: string;
}) {
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<MemberSort>("Newest");
    const [pruneOpen, setPruneOpen] = useState(false);

    const q = query.trim().toLowerCase();
    const filtered = members
        .filter((m) => !q || (m.userName ?? "").toLowerCase().includes(q) || (m.userUsername ?? "").toLowerCase().includes(q))
        .sort((a, b) => {
            if (sort === "A–Z") return (a.userName ?? "").localeCompare(b.userName ?? "");
            const d = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            return sort === "Oldest" ? d : -d;
        });

    return (
        <div>
            <SectionHint>{members.length} {members.length === 1 ? "person" : "people"} in this server. Bans stop rejoining; kicks don&apos;t.</SectionHint>

            <div className="mb-4 flex items-center gap-2">
                <Input
                    radius={14}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search by name or username"
                    className="h-12 flex-1 text-[14px] font-semibold"
                />
                <GooDropdown
                    side="bottom"
                    align="end"
                    width={150}
                    gap={6}
                    buttonRadius={16}
                    triggerAriaLabel="Sort members"
                    triggerClassName="flex h-12 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-white/5 px-4 text-[14px] font-bold text-zinc-200 transition-colors hover:bg-white/10 hover:text-white"
                    trigger={
                        <>
                            {sort}
                            <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-zinc-500" strokeWidth={2} />
                        </>
                    }
                    items={MEMBER_SORTS.map((s) => ({
                        key: s,
                        onClick: () => setSort(s),
                        className: "text-[14px] font-medium text-zinc-100 hover:bg-white/10",
                        label: <>{s}</>,
                    }))}
                />
            </div>

            {filtered.length === 0 && (
                <div className="py-10 text-center">
                    <p className="text-[15px] font-bold text-zinc-400">Nobody matches</p>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-600">Try a different name or username</p>
                </div>
            )}

            <div className="space-y-0.5">
                {filtered.map((m) => (
                    <MemberRow key={m.userId} serverId={serverId} m={m} customRoles={customRoles} isAdmin={isAdmin} isSelf={m.userId === currentUserId} />
                ))}
            </div>

            {isAdmin && (
                <div className="mt-8 flex items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4">
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-white">Prune inactive members</p>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            Remove members who haven&apos;t posted in a while. They can rejoin any time.
                        </p>
                    </div>
                    <ActionButton variant="soft" className="h-11 shrink-0 px-5 text-[14px]" onClick={() => setPruneOpen(true)}>
                        Prune
                    </ActionButton>
                </div>
            )}
            {pruneOpen && <PruneDialog serverId={serverId} onClose={() => setPruneOpen(false)} />}
        </div>
    );
}

const PRUNE_WINDOWS = [30, 90, 180] as const;

function PruneDialog({ serverId, onClose }: { serverId: string; onClose: () => void }) {
    const utils = trpc.useUtils();
    const [days, setDays] = useState<number>(30);
    const preview = trpc.community.getPruneCount.useQuery({ serverId, days });
    const prune = trpc.community.pruneMembers.useMutation({
        onSuccess: (res) => {
            utils.community.getServer.invalidate({ serverId });
            toast.success(res.removed === 0 ? "Nobody to prune" : `Pruned ${res.removed} member${res.removed === 1 ? "" : "s"}`);
            onClose();
        },
        onError: (err) => toast.error(err.message),
    });
    const n = preview.data?.count;

    return (
        <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="rounded-4xl border-none p-6 sm:max-w-md" showCloseButton={false}>
                <DialogTitle className="text-center text-[18px] font-bold tracking-tight text-white">Prune inactive members</DialogTitle>
                <p className="text-center text-[14px] font-medium text-zinc-500">
                    Removes members with no messages in the window. Mods, admins, and the owner are never pruned — and anyone removed can rejoin.
                </p>

                <div className="mt-2 flex justify-center gap-1.5">
                    {PRUNE_WINDOWS.map((d) => (
                        <button
                            key={d}
                            onClick={() => setDays(d)}
                            className={cn(
                                "h-10 cursor-pointer rounded-full px-4 text-[14px] font-bold transition-colors",
                                days === d ? "bg-white text-black" : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white",
                            )}
                        >
                            {d} days
                        </button>
                    ))}
                </div>

                <p className="mt-1 text-center text-[14px] font-semibold text-zinc-300">
                    {preview.isLoading || n == null
                        ? "Counting…"
                        : n === 0
                            ? "Nobody has been quiet that long"
                            : `${n} member${n === 1 ? "" : "s"} would be removed`}
                </p>

                <div className="mt-2 flex gap-2">
                    <ActionButton variant="soft" className="flex-1" onClick={onClose}>
                        Cancel
                    </ActionButton>
                    <ActionButton
                        className="flex-1 bg-pastelred text-black hover:bg-pastelred/90"
                        onClick={() => prune.mutate({ serverId, days })}
                        disabled={prune.isPending || !n}
                    >
                        {prune.isPending ? "Pruning…" : "Prune"}
                    </ActionButton>
                </div>
            </DialogContent>
        </Dialog>
    );
}

// Flat hex palette for custom role colors (name tint in chat + member lists)
const ROLE_COLORS = ["#FFCC00", "#00ED89", "#1DA1F2", "#FF746C", "#A78BFA", "#F9A8D4", "#FB923C", "#E4E4E7"] as const;

function CustomRoleRow({
    serverId,
    role,
    memberCount,
    onMove,
}: {
    serverId: string;
    role: CustomRole;
    memberCount: number;
    /** move within the order: -1 up (higher priority), +1 down */
    onMove: (dir: -1 | 1) => void;
}) {
    const utils = trpc.useUtils();
    const invalidate = () => utils.community.getServer.invalidate({ serverId });
    const [name, setName] = useState(role.name);
    const updateRole = trpc.community.updateRole.useMutation({ onSuccess: invalidate, onError: (err) => toast.error(err.message) });
    const deleteRole = trpc.community.deleteRole.useMutation({ onSuccess: invalidate, onError: (err) => toast.error(err.message) });

    const commitName = () => {
        const trimmed = name.trim();
        if (!trimmed || trimmed === role.name) {
            setName(role.name);
            return;
        }
        updateRole.mutate({ serverId, roleId: role.id, name: trimmed });
    };

    return (
        <div className="flex items-center gap-3 rounded-[18px] px-2.5 py-2 transition-colors hover:bg-white/[0.04]">
            <GooDropdown
                side="bottom"
                align="start"
                width={168}
                gap={6}
                buttonRadius={16}
                triggerAriaLabel={`Change ${role.name} color`}
                triggerClassName="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full bg-white/5 transition-colors hover:bg-white/10"
                trigger={<span className="size-4 rounded-full" style={{ backgroundColor: role.color }} />}
                items={[{
                    key: "palette",
                    className: "hover:bg-transparent cursor-default",
                    onClick: () => {},
                    label: (
                        <span className="grid w-full grid-cols-4 gap-1.5 py-0.5">
                            {ROLE_COLORS.map((c) => (
                                <button
                                    key={c}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        updateRole.mutate({ serverId, roleId: role.id, color: c });
                                    }}
                                    aria-label={`Use ${c}`}
                                    className={cn(
                                        "size-7 cursor-pointer rounded-full transition-transform hover:scale-110",
                                        role.color.toLowerCase() === c.toLowerCase() && "ring-2 ring-white ring-offset-2 ring-offset-[#101011]",
                                    )}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </span>
                    ),
                }]}
            />
            <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                maxLength={32}
                aria-label="Role name"
                className="min-w-0 flex-1 bg-transparent text-[15px] font-bold outline-none"
                style={{ color: role.color }}
            />
            <span className="shrink-0 text-[12px] font-bold tabular-nums text-zinc-600">
                {memberCount} {memberCount === 1 ? "member" : "members"}
            </span>
            {/* Order = priority: the highest role a member has colors their name */}
            <span className="flex shrink-0 items-center">
                <button
                    onClick={() => onMove(-1)}
                    aria-label={`Move ${role.name} up`}
                    className="grid size-7 cursor-pointer place-items-center rounded-full text-zinc-600 transition-colors hover:bg-white/10 hover:text-white"
                >
                    <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 rotate-180" strokeWidth={2.5} />
                </button>
                <button
                    onClick={() => onMove(1)}
                    aria-label={`Move ${role.name} down`}
                    className="grid size-7 cursor-pointer place-items-center rounded-full text-zinc-600 transition-colors hover:bg-white/10 hover:text-white"
                >
                    <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" strokeWidth={2.5} />
                </button>
            </span>
            <button
                onClick={() => deleteRole.mutate({ serverId, roleId: role.id })}
                disabled={deleteRole.isPending}
                aria-label={`Delete ${role.name}`}
                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-zinc-600 transition-colors hover:bg-pastelred/10 hover:text-pastelred disabled:opacity-50"
            >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" strokeWidth={2.5} />
            </button>
        </div>
    );
}

function RolesSection({
    serverId,
    members,
    customRoles,
    isAdmin,
    currentUserId,
}: {
    serverId: string;
    members: Member[];
    customRoles: CustomRole[];
    isAdmin: boolean;
    currentUserId?: string;
}) {
    const ROLE_HINT: Record<string, string> = {
        ADMIN: "Full control — settings, roles, bans, channels",
        MODERATOR: "Manage channels, pins, and invites",
        GUEST: "Chat and join voice",
    };

    const utils = trpc.useUtils();
    const [newName, setNewName] = useState("");
    const [newColor, setNewColor] = useState<string>(ROLE_COLORS[0]);
    const createRole = trpc.community.createRole.useMutation({
        onSuccess: () => {
            utils.community.getServer.invalidate({ serverId });
            setNewName("");
        },
        onError: (err) => toast.error(err.message),
    });
    const reorderRoles = trpc.community.reorderRoles.useMutation({
        onSuccess: () => utils.community.getServer.invalidate({ serverId }),
        onError: (err) => toast.error(err.message),
    });

    const moveRole = (index: number, dir: -1 | 1) => {
        const target = index + dir;
        if (target < 0 || target >= customRoles.length) return;
        const ids = customRoles.map((r) => r.id);
        [ids[index], ids[target]] = [ids[target], ids[index]];
        reorderRoles.mutate({ serverId, roleIds: ids });
    };

    const countFor = (roleId: string) => members.filter((m) => m.roleIds?.includes(roleId)).length;

    return (
        <div>
            <SectionHint>
                Three functional roles carry the permissions. Custom roles add identity on top — a name and a color that tints members in chat.
            </SectionHint>

            {isAdmin && (
                <div className="mb-7">
                    <div className="mb-1 flex items-baseline gap-2 px-1">
                        <h2 className="text-[15px] font-semibold text-zinc-300">Custom roles</h2>
                        <span className="text-[12px] font-bold tabular-nums text-zinc-600">{customRoles.length}</span>
                    </div>
                    <p className="mb-2 px-1 text-[13px] font-medium text-zinc-600">
                        Hand them out from any member&apos;s row. Up to 20.
                    </p>

                    {customRoles.length > 0 && (
                        <div className="mb-3 space-y-0.5">
                            {customRoles.map((r, i) => (
                                <CustomRoleRow key={r.id} serverId={serverId} role={r} memberCount={countFor(r.id)} onMove={(dir) => moveRole(i, dir)} />
                            ))}
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <div className="flex shrink-0 items-center gap-1">
                            {ROLE_COLORS.slice(0, 4).map((c) => (
                                <button
                                    key={c}
                                    onClick={() => setNewColor(c)}
                                    aria-label={`New role color ${c}`}
                                    className={cn(
                                        "size-7 cursor-pointer rounded-full transition-all",
                                        newColor === c && "ring-2 ring-white ring-offset-2 ring-offset-background",
                                    )}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                        <Input
                            radius={14}
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && newName.trim()) {
                                    createRole.mutate({ serverId, name: newName.trim(), color: newColor });
                                }
                            }}
                            placeholder="OG, artist, degen…"
                            maxLength={32}
                            className="h-12 flex-1 text-[14px] font-semibold"
                        />
                        <ActionButton
                            variant="soft"
                            className="h-12 shrink-0 px-5"
                            onClick={() => createRole.mutate({ serverId, name: newName.trim(), color: newColor })}
                            disabled={!newName.trim() || createRole.isPending || customRoles.length >= 20}
                        >
                            Add
                        </ActionButton>
                    </div>
                </div>
            )}

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
                                    <MemberRow key={m.userId} serverId={serverId} m={m} customRoles={customRoles} isAdmin={isAdmin} isSelf={m.userId === currentUserId} />
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

function InvitesSection({ server, isAdmin }: { server: CommunityServer; isAdmin: boolean }) {
    const serverId = server.id;
    const [copied, setCopied] = useState(false);
    const utils = trpc.useUtils();
    const generateInvite = trpc.community.generateInviteCode.useMutation({
        onSuccess: () => utils.community.getServer.invalidate({ serverId }),
    });
    const setPaused = useSetInvitesPaused(serverId);

    const inviteUrl = typeof window !== "undefined"
        ? `${window.location.origin}/communities/invite/${server.inviteCode}`
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
                className="mt-4 flex cursor-pointer items-center gap-1.5 rounded-full py-1.5 text-[13px] font-semibold text-zinc-500 transition-colors hover:text-white disabled:opacity-50"
            >
                <HugeiconsIcon icon={RefreshIcon} className={cn("size-3.5", generateInvite.isPending && "animate-spin")} strokeWidth={2} />
                Generate a new link — the old one stops working
            </button>

            {isAdmin && (
                <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-white">Pause invites</p>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            Nobody can join while paused — even with a valid link.
                        </p>
                    </div>
                    <Switch
                        checked={!!server.invitesPaused}
                        onCheckedChange={(v) => setPaused.mutate({ serverId, paused: v })}
                    />
                </label>
            )}

            <ExtraInvites serverId={serverId} />
        </div>
    );
}

// Per-link invites: limited-use / expiring codes alongside the main link.
const INVITE_EXPIRIES = [
    { label: "Never", hours: null },
    { label: "1 day", hours: 24 },
    { label: "7 days", hours: 24 * 7 },
    { label: "30 days", hours: 24 * 30 },
] as const;
const INVITE_USES = [
    { label: "Unlimited", value: null },
    { label: "1 use", value: 1 },
    { label: "10 uses", value: 10 },
    { label: "50 uses", value: 50 },
] as const;

function ExtraInvites({ serverId }: { serverId: string }) {
    const utils = trpc.useUtils();
    const [expiry, setExpiry] = useState<(typeof INVITE_EXPIRIES)[number]>(INVITE_EXPIRIES[0]);
    const [uses, setUses] = useState<(typeof INVITE_USES)[number]>(INVITE_USES[0]);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const { data: invites = [] } = trpc.community.listInvites.useQuery({ serverId });
    const createInvite = trpc.community.createInvite.useMutation({
        onSuccess: () => utils.community.listInvites.invalidate({ serverId }),
        onError: (err) => toast.error(err.message),
    });
    const deleteInvite = trpc.community.deleteInvite.useMutation({
        onSuccess: () => utils.community.listInvites.invalidate({ serverId }),
        onError: (err) => toast.error(err.message),
    });

    const copy = (id: string, code: string) => {
        void navigator.clipboard.writeText(`${window.location.origin}/communities/invite/${code}`);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 1500);
    };

    const inviteStatus = (inv: (typeof invites)[number]) => {
        if (inv.expiresAt && isPast(new Date(inv.expiresAt))) return "expired";
        if (inv.maxUses !== null && inv.uses >= inv.maxUses) return "used up";
        return null;
    };

    return (
        <div className="mt-8">
            <h2 className="mb-1 px-1 text-[15px] font-semibold text-zinc-300">Extra invite links</h2>
            <p className="mb-3 px-1 text-[13px] font-medium text-zinc-600">
                One-off links with their own limits — revoke any of them without touching the main link.
            </p>

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <GooDropdown
                    side="bottom"
                    align="start"
                    width={150}
                    gap={6}
                    buttonRadius={16}
                    triggerAriaLabel="Invite expiry"
                    triggerClassName="flex h-11 cursor-pointer items-center gap-1.5 rounded-full bg-white/5 px-4 text-[13px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                    trigger={<>Expires: {expiry.label}<HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-zinc-500" strokeWidth={2} /></>}
                    items={INVITE_EXPIRIES.map((e) => ({
                        key: e.label,
                        onClick: () => setExpiry(e),
                        className: "text-[13px] font-medium text-zinc-100 hover:bg-white/10",
                        label: <>{e.label}</>,
                    }))}
                />
                <GooDropdown
                    side="bottom"
                    align="start"
                    width={150}
                    gap={6}
                    buttonRadius={16}
                    triggerAriaLabel="Invite max uses"
                    triggerClassName="flex h-11 cursor-pointer items-center gap-1.5 rounded-full bg-white/5 px-4 text-[13px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                    trigger={<>{uses.label}<HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-zinc-500" strokeWidth={2} /></>}
                    items={INVITE_USES.map((u) => ({
                        key: u.label,
                        onClick: () => setUses(u),
                        className: "text-[13px] font-medium text-zinc-100 hover:bg-white/10",
                        label: <>{u.label}</>,
                    }))}
                />
                <ActionButton
                    variant="soft"
                    className="h-11 px-5 text-[14px]"
                    onClick={() => createInvite.mutate({ serverId, maxUses: uses.value, expiresInHours: expiry.hours })}
                    disabled={createInvite.isPending}
                >
                    Create link
                </ActionButton>
            </div>

            {invites.length > 0 && (
                <div className="space-y-0.5">
                    {invites.map((inv) => {
                        const status = inviteStatus(inv);
                        return (
                            <div key={inv.id} className="flex items-center gap-3 rounded-[18px] px-2.5 py-2 transition-colors hover:bg-white/[0.04]">
                                <button
                                    onClick={() => copy(inv.id, inv.code)}
                                    className="flex min-w-0 cursor-pointer items-center gap-1.5 text-left"
                                >
                                    <span className={cn("truncate text-[14px] font-bold", status ? "text-zinc-600 line-through" : "text-zinc-200")}>
                                        /invite/{inv.code}
                                    </span>
                                    {copiedId === inv.id
                                        ? <HugeiconsIcon icon={Tick02Icon} className="size-3.5 shrink-0 text-white" strokeWidth={2.5} />
                                        : <HugeiconsIcon icon={Copy01Icon} className="size-3 shrink-0 text-zinc-600" strokeWidth={2} />}
                                </button>
                                <span className="min-w-0 flex-1 truncate text-right text-[12px] font-medium text-zinc-600">
                                    {status ?? <>
                                        {inv.maxUses !== null ? `${inv.uses}/${inv.maxUses} uses` : `${inv.uses} uses`}
                                        {inv.expiresAt ? ` · expires ${formatDistanceToNow(new Date(inv.expiresAt), { addSuffix: true })}` : ""}
                                    </>}
                                </span>
                                <button
                                    onClick={() => deleteInvite.mutate({ serverId, inviteId: inv.id })}
                                    disabled={deleteInvite.isPending}
                                    aria-label="Revoke invite"
                                    className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-zinc-600 transition-colors hover:bg-pastelred/10 hover:text-pastelred disabled:opacity-50"
                                >
                                    <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" strokeWidth={2.5} />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Bans ────────────────────────────────────────────────

function BansSection({ serverId, isAdmin }: { serverId: string; isAdmin: boolean }) {
    const utils = trpc.useUtils();
    const [query, setQuery] = useState("");
    const { data: allBans = [], isLoading } = trpc.community.listBans.useQuery({ serverId });
    const unban = trpc.community.unbanMember.useMutation({
        onSuccess: () => utils.community.listBans.invalidate({ serverId }),
    });

    const q = query.trim().toLowerCase();
    const bans = allBans.filter(
        (b) => !q || (b.userName ?? "").toLowerCase().includes(q) || (b.userUsername ?? "").toLowerCase().includes(q),
    );

    return (
        <div>
            <SectionHint>Banned users can&apos;t rejoin, even with a fresh invite link.</SectionHint>

            {allBans.length > 0 && (
                <Input
                    radius={14}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search bans by name or username"
                    className="mb-4 h-12 text-[14px] font-semibold"
                />
            )}

            {isLoading && (
                <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-14 overflow-hidden rounded-[18px]"><div className="size-full shimmer-skeleton" /></div>
                    ))}
                </div>
            )}

            {!isLoading && bans.length === 0 && (
                <div className="py-10 text-center">
                    <p className="text-[15px] font-bold text-zinc-400">{allBans.length ? "Nobody matches" : "No bans"}</p>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-600">
                        {allBans.length ? "Try a different name" : "Ban members from their row in Members"}
                    </p>
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
    // Switch rules flip optimistically; the keywords Save keeps its own toast.
    const updateServerToggle = useUpdateServer(server.id);

    const dirty = keywords !== (server.automodKeywords ?? "");
    const wordCount = keywords.split(",").map((w) => w.trim()).filter(Boolean).length;

    return (
        <div>
            <SectionHint>Rules run on members&apos; messages before they post. Mods and admins are exempt.</SectionHint>

            <div className="space-y-2">
                {/* Rule: block links */}
                <label className="flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-white">Block links</p>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            Members can&apos;t post URLs — kills drive-by scam links.
                        </p>
                    </div>
                    <Switch
                        checked={!!server.automodBlockLinks}
                        onCheckedChange={(v) => updateServerToggle.mutate({ serverId: server.id, automodBlockLinks: v })}
                    />
                </label>

                {/* Rule: mention spam */}
                <label className="flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-white">Block mention spam</p>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            Messages with more than 5 @mentions are rejected.
                        </p>
                    </div>
                    <Switch
                        checked={!!server.automodBlockMentions}
                        onCheckedChange={(v) => updateServerToggle.mutate({ serverId: server.id, automodBlockMentions: v })}
                    />
                </label>

                {/* Rule: commonly flagged words */}
                <label className="flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-white">Block commonly flagged words</p>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            A built-in filter for slurs and abuse — no setup needed.
                        </p>
                    </div>
                    <Switch
                        checked={!!server.automodFlaggedWords}
                        onCheckedChange={(v) => updateServerToggle.mutate({ serverId: server.id, automodFlaggedWords: v })}
                    />
                </label>

                {/* Rule: custom words */}
                <div className="rounded-3xl bg-white/[0.03] px-5 py-4">
                    <p className="text-[15px] font-bold text-white">Block custom words</p>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                        Messages containing any of these are rejected. Separate with commas.
                    </p>
                    <textarea
                        value={keywords}
                        onChange={(e) => setKeywords(e.target.value)}
                        placeholder="spam, scam link, another phrase"
                        rows={4}
                        maxLength={2000}
                        className="mt-3 w-full resize-none rounded-2xl bg-white/[0.04] px-4 py-3.5 text-[15px] font-medium text-white outline-none transition-colors placeholder:text-zinc-600 focus:bg-white/[0.06]"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-[13px] font-medium text-zinc-600">
                            {wordCount > 0 ? `${wordCount} blocked.` : "Nothing blocked yet."}
                        </p>
                        <ActionButton
                            className="h-11 px-5 text-[14px]"
                            onClick={() => updateServer.mutate({ serverId: server.id, automodKeywords: keywords.trim() || null })}
                            disabled={!dirty || updateServer.isPending}
                        >
                            {updateServer.isPending ? "Saving…" : "Save words"}
                        </ActionButton>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Server tag ──────────────────────────────────────────

// Tag badges: emoji identity marks (our spin on the reference's pixel badges)
const TAG_BADGES = ["⚔️", "🔥", "💎", "🌊", "🍄", "⚡", "🌙", "💀", "🪷", "🎯", "🃏", "🫧"] as const;
// Flat chip colors — brand tokens only
const TAG_COLORS: { name: string; value: string }[] = [
    { name: "Default", value: "" },
    { name: "Sunset", value: "#FFCC00" },
    { name: "Lantern", value: "#00ED89" },
    { name: "Sky", value: "#1DA1F2" },
    { name: "Rose", value: "#FF746C" },
    { name: "Violet", value: "#A78BFA" },
];

/** The tag chip, rendered identically here and wherever the tag shows. */
export function ServerTagChip({ tag, badge, color, className }: { tag: string; badge?: string | null; color?: string | null; className?: string }) {
    return (
        <span
            className={cn("inline-flex shrink-0 items-center gap-1 rounded-[8px] px-2 py-1 text-[12px] font-bold tracking-wide", className)}
            style={color
                ? { backgroundColor: `${color}26`, color }
                : undefined}
            {...(!color ? { "data-plain": true } : {})}
        >
            {badge && <span className="text-[11px] leading-none">{badge}</span>}
            {tag}
        </span>
    );
}

function TagSection({ server }: { server: CommunityServer }) {
    const utils = trpc.useUtils();
    const [tag, setTag] = useState(server.tag ?? "");
    const [badge, setBadge] = useState(server.tagBadge ?? "");
    const [color, setColor] = useState(server.tagColor ?? "");
    const updateServer = trpc.community.updateServer.useMutation({
        onSuccess: () => {
            utils.community.getServer.invalidate({ serverId: server.id });
            toast.success("Server tag updated");
        },
        onError: () => toast.error("Update failed"),
    });

    const cleanTag = tag.trim().toUpperCase().slice(0, 8);
    const dirty =
        cleanTag !== (server.tag ?? "") ||
        badge !== (server.tagBadge ?? "") ||
        color !== (server.tagColor ?? "");

    return (
        <div>
            <SectionHint>A short badge shown next to your server name. Members can copy it from the name menu.</SectionHint>

            {/* Preview */}
            <div className="mb-7 flex items-center gap-3 rounded-3xl bg-white/[0.03] p-5">
                <p className="truncate text-[17px] font-bold tracking-tight text-white">{server.name}</p>
                {cleanTag ? (
                    <ServerTagChip
                        tag={cleanTag}
                        badge={badge || null}
                        color={color || null}
                        className={!color ? "bg-white/10 text-zinc-200" : undefined}
                    />
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

            {/* Badge */}
            <p className="mb-1.5 mt-6 px-1 text-[14px] font-semibold text-zinc-500">Badge</p>
            <div className="flex flex-wrap gap-1.5">
                <button
                    onClick={() => setBadge("")}
                    className={cn(
                        "grid size-11 cursor-pointer place-items-center rounded-2xl text-[12px] font-bold text-zinc-500 transition-colors",
                        badge === "" ? "bg-white/15 text-white" : "bg-white/[0.04] hover:bg-white/10",
                    )}
                >
                    none
                </button>
                {TAG_BADGES.map((b) => (
                    <button
                        key={b}
                        onClick={() => setBadge(b)}
                        aria-label={`Badge ${b}`}
                        className={cn(
                            "grid size-11 cursor-pointer place-items-center rounded-2xl text-[18px] transition-colors",
                            badge === b ? "bg-white/15 ring-2 ring-white" : "bg-white/[0.04] hover:bg-white/10",
                        )}
                    >
                        {b}
                    </button>
                ))}
            </div>

            {/* Color */}
            <p className="mb-1.5 mt-6 px-1 text-[14px] font-semibold text-zinc-500">Color</p>
            <div className="flex flex-wrap gap-1.5">
                {TAG_COLORS.map((c) => (
                    <button
                        key={c.name}
                        onClick={() => setColor(c.value)}
                        aria-label={`${c.name} tag color`}
                        title={c.name}
                        className={cn(
                            "h-11 cursor-pointer rounded-2xl px-4 text-[13px] font-bold transition-colors",
                            color === c.value ? "ring-2 ring-white" : "",
                            !c.value && "bg-white/[0.06] text-zinc-300",
                        )}
                        style={c.value ? { backgroundColor: `${c.value}26`, color: c.value } : undefined}
                    >
                        {c.name}
                    </button>
                ))}
            </div>

            <ActionButton
                className="mt-7"
                onClick={() => updateServer.mutate({
                    serverId: server.id,
                    tag: cleanTag || null,
                    tagBadge: badge || null,
                    tagColor: color || null,
                })}
                disabled={!dirty || updateServer.isPending}
            >
                {updateServer.isPending ? "Saving…" : "Save tag"}
            </ActionButton>
        </div>
    );
}

// ─── Expressions (emoji + stickers) ──────────────────────

function ExpressionsSection({ serverId, kind, boostCount }: { serverId: string; kind: "emoji" | "sticker"; boostCount: number }) {
    const utils = trpc.useUtils();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [pendingPreview, setPendingPreview] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [uploading, setUploading] = useState(false);

    const { data: expressions = [], isLoading } = trpc.community.listExpressions.useQuery({ serverId });
    const items = expressions.filter((e) => e.kind === kind);

    // Slot caps scale with the boost level (enforced server-side too)
    const level = boostLevelFor(boostCount);
    const next = nextBoostLevel(boostCount);
    const cap = kind === "emoji" ? level.emojiSlots : level.stickerSlots;
    const nextCap = next ? (kind === "emoji" ? next.emojiSlots : next.stickerSlots) : null;

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

            {/* Slot usage — caps come from the boost level */}
            <div className="mb-5 rounded-3xl bg-white/[0.03] px-5 py-4">
                <div className="flex items-center justify-between">
                    <p className="text-[15px] font-bold text-white">
                        {items.length} of {cap} slots used
                    </p>
                    <span className="text-[12px] font-bold text-zinc-600">level {level.level}</span>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                        className="h-full rounded-full bg-white transition-all"
                        style={{ width: `${Math.min(100, (items.length / cap) * 100)}%` }}
                    />
                </div>
                {nextCap && (
                    <p className="mt-2 text-[13px] font-medium text-zinc-500">
                        Level {next!.level} unlocks {nextCap} slots — {next!.threshold - boostCount} more boost{next!.threshold - boostCount === 1 ? "" : "s"}.
                    </p>
                )}
            </div>

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

const SOUND_MAX_SECONDS = 10;
const SOUND_MAX_BYTES = 2 * 1024 * 1024;

function SoundboardSection({ serverId, boostCount }: { serverId: string; boostCount: number }) {
    const utils = trpc.useUtils();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [pendingUrl, setPendingUrl] = useState<string | null>(null);
    const [name, setName] = useState("");
    const [emoji, setEmoji] = useState("");
    const [uploading, setUploading] = useState(false);
    const previewRef = useRef<HTMLAudioElement | null>(null);

    const { data: sounds = [], isLoading } = trpc.community.listSounds.useQuery({ serverId });

    const level = boostLevelFor(boostCount);
    const next = nextBoostLevel(boostCount);
    const cap = level.soundSlots;

    const getPresignedUrl = trpc.upload.getPresignedUrl.useMutation();
    const addSound = trpc.community.addSound.useMutation();
    const deleteSound = trpc.community.deleteSound.useMutation({
        onSuccess: () => utils.community.listSounds.invalidate({ serverId }),
    });

    const play = (url: string) => {
        previewRef.current?.pause();
        const el = new Audio(url);
        el.volume = 0.75;
        previewRef.current = el;
        el.play().catch(() => {});
    };

    const pickFile = (f: File) => {
        if (f.size > SOUND_MAX_BYTES) {
            toast.error("Sounds max out at 2MB");
            return;
        }
        const url = URL.createObjectURL(f);
        // Enforce the clip length before paying for the upload
        const probe = new Audio(url);
        probe.addEventListener("loadedmetadata", () => {
            if (probe.duration > SOUND_MAX_SECONDS) {
                toast.error(`Sounds max out at ${SOUND_MAX_SECONDS} seconds`);
                URL.revokeObjectURL(url);
                return;
            }
            setPendingFile(f);
            setPendingUrl(url);
            setName(f.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32));
        });
        probe.addEventListener("error", () => {
            toast.error("That file doesn't decode as audio");
            URL.revokeObjectURL(url);
        });
    };

    const clearPending = () => {
        if (pendingUrl) URL.revokeObjectURL(pendingUrl);
        setPendingFile(null);
        setPendingUrl(null);
        setName("");
        setEmoji("");
    };

    const upload = async () => {
        if (!pendingFile || !/^[a-z0-9_]{2,32}$/.test(name) || uploading) return;
        setUploading(true);
        try {
            const ext = pendingFile.name.split(".").pop() || "mp3";
            const { token, path } = await getPresignedUrl.mutateAsync({
                bucket: "sounds",
                filename: `${name}.${ext}`,
                contentType: pendingFile.type || "audio/mpeg",
            });
            const { data: up, error } = await supabase.storage.from("sounds").uploadToSignedUrl(path, token, pendingFile);
            if (error || !up) throw new Error("Upload failed");
            const audioUrl = supabase.storage.from("sounds").getPublicUrl(up.path).data.publicUrl;
            await addSound.mutateAsync({ serverId, name, emoji: emoji || undefined, audioUrl });
            utils.community.listSounds.invalidate({ serverId });
            clearPending();
            toast.success(`${name} added to the soundboard`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div>
            <SectionHint>
                Short clips (up to {SOUND_MAX_SECONDS}s) anyone in a voice channel can fire from the soundboard — everyone in the room hears them.
            </SectionHint>

            {/* Slot usage — caps come from the boost level */}
            <div className="mb-5 rounded-3xl bg-white/[0.03] px-5 py-4">
                <div className="flex items-center justify-between">
                    <p className="text-[15px] font-bold text-white">
                        {sounds.length} of {cap} slots used
                    </p>
                    <span className="text-[12px] font-bold text-zinc-600">level {level.level}</span>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <div
                        className="h-full rounded-full bg-white transition-all"
                        style={{ width: `${Math.min(100, (sounds.length / cap) * 100)}%` }}
                    />
                </div>
                {next && (
                    <p className="mt-2 text-[13px] font-medium text-zinc-500">
                        Level {next.level} unlocks {next.soundSlots} slots — {next.threshold - boostCount} more boost{next.threshold - boostCount === 1 ? "" : "s"}.
                    </p>
                )}
            </div>

            {/* Upload */}
            {!pendingFile ? (
                <ActionButton className="mb-7" onClick={() => fileInputRef.current?.click()}>
                    <HugeiconsIcon icon={FileAudioIcon} className="size-4" strokeWidth={2} />
                    Upload sound
                </ActionButton>
            ) : (
                <div className="mb-7 flex flex-wrap items-center gap-3 rounded-3xl bg-white/[0.03] p-4">
                    <button
                        onClick={() => pendingUrl && play(pendingUrl)}
                        aria-label="Preview sound"
                        className="grid size-12 shrink-0 cursor-pointer place-items-center rounded-[14px] bg-black4 text-zinc-300 transition-colors hover:text-white"
                    >
                        <HugeiconsIcon icon={PlayIcon} className="size-5" strokeWidth={2} />
                    </button>
                    <Input
                        radius={12}
                        value={emoji}
                        onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
                        placeholder="🙂"
                        aria-label="Sound emoji (optional)"
                        className="h-11 w-14 shrink-0 text-center text-[16px]"
                    />
                    <Input
                        radius={12}
                        value={name}
                        onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                        placeholder="name"
                        maxLength={32}
                        autoFocus
                        className="h-11 min-w-24 flex-1 text-[14px] font-bold"
                    />
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
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) pickFile(f);
                    e.target.value = "";
                }}
            />

            {isLoading && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="aspect-square overflow-hidden rounded-2xl"><div className="size-full shimmer-skeleton" /></div>
                    ))}
                </div>
            )}

            {!isLoading && sounds.length === 0 && (
                <div className="py-10 text-center">
                    <p className="text-[15px] font-bold text-zinc-400">No sounds yet</p>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-600">Upload the first one — it shows up in every voice channel</p>
                </div>
            )}

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {sounds.map((s) => (
                    <div key={s.id} className="group relative flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]">
                        <button
                            onClick={() => play(s.audioUrl)}
                            aria-label={`Play ${s.name}`}
                            className="grid size-full cursor-pointer place-items-center"
                        >
                            {s.emoji ? (
                                <span className="text-[28px] leading-none">{s.emoji}</span>
                            ) : (
                                <HugeiconsIcon icon={AudioWave01Icon} className="size-7 text-zinc-300" strokeWidth={2} />
                            )}
                        </button>
                        <p className="w-full truncate text-center text-[12px] font-bold text-zinc-500">{s.name}</p>
                        <button
                            onClick={() => deleteSound.mutate({ serverId, soundId: s.id })}
                            disabled={deleteSound.isPending}
                            aria-label={`Delete ${s.name}`}
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

// ─── Access ──────────────────────────────────────────────

function AccessSection({
    server,
    channels,
}: {
    server: CommunityServer;
    channels: (CommunityChannel & { unreadCount?: number })[];
}) {
    const utils = trpc.useUtils();
    const setPaused = useSetInvitesPaused(server.id);
    const updateServer = useUpdateServer(server.id);

    const readOnlyCount = channels.filter((c) => c.readOnly).length;
    const [rulesDraft, setRulesDraft] = useState(server.rules ?? "");
    const rulesDirty = rulesDraft.trim() !== (server.rules ?? "");

    const JOIN_METHODS = [
        {
            key: "invite" as const,
            title: "Invite only",
            desc: "People join with your invite link",
            active: !server.discoverable,
        },
        {
            key: "discoverable" as const,
            title: "Discoverable",
            desc: "Anyone can find and join from the Communities page",
            active: !!server.discoverable,
        },
    ];

    return (
        <div>
            <SectionHint>Who can get in, and what they can touch once they&apos;re here.</SectionHint>

            {/* Join method */}
            <p className="mb-2 px-1 text-[14px] font-semibold text-zinc-500">How can people join?</p>
            <div className="mb-6 grid grid-cols-2 gap-2">
                {JOIN_METHODS.map((m) => (
                    <button
                        key={m.key}
                        onClick={() => updateServer.mutate({ serverId: server.id, discoverable: m.key === "discoverable" })}
                        className={cn(
                            "cursor-pointer rounded-3xl px-5 py-5 text-left transition-colors",
                            m.active ? "bg-white/[0.08] ring-2 ring-white/40" : "bg-white/[0.03] hover:bg-white/[0.05]",
                        )}
                    >
                        <span className={cn("block text-[15px] font-bold", m.active ? "text-white" : "text-zinc-300")}>{m.title}</span>
                        <span className="mt-1 block text-[13px] font-medium leading-relaxed text-zinc-500">{m.desc}</span>
                    </button>
                ))}
            </div>

            {/* Age restriction */}
            <label className="mb-3 flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
                <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-white">Age-restricted server</p>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                        Visitors confirm they&apos;re over the legal age before viewing anything here.
                    </p>
                </div>
                <Switch
                    checked={!!server.ageRestricted}
                    onCheckedChange={(v) => updateServer.mutate({ serverId: server.id, ageRestricted: v })}
                />
            </label>

            {/* Server rules */}
            <div className="mb-3 rounded-3xl bg-white/[0.03] px-5 py-4">
                <label className="flex cursor-pointer items-center gap-3">
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-white">Server rules</p>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            Members must agree to the rules before they can chat. One rule per line.
                        </p>
                    </div>
                    <Switch
                        checked={!!server.rulesRequired}
                        onCheckedChange={(v) => updateServer.mutate({ serverId: server.id, rulesRequired: v })}
                        disabled={!(server.rules ?? rulesDraft.trim())}
                    />
                </label>
                <textarea
                    value={rulesDraft}
                    onChange={(e) => setRulesDraft(e.target.value)}
                    placeholder={"Be civil and respectful\nNo spam or self-promotion\nHelp keep things safe"}
                    rows={4}
                    maxLength={4000}
                    className="mt-3 w-full resize-none rounded-2xl bg-white/[0.04] px-4 py-3.5 text-[14px] font-medium leading-relaxed text-white outline-none transition-colors placeholder:text-zinc-600 focus:bg-white/[0.06]"
                />
                {rulesDirty && (
                    <ActionButton
                        variant="soft"
                        className="mt-2 h-11 px-5 text-[14px]"
                        onClick={() => updateServer.mutate({ serverId: server.id, rules: rulesDraft.trim() || null })}
                        disabled={updateServer.isPending}
                    >
                        Save rules
                    </ActionButton>
                )}
            </div>

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

function IntegrationsSection({ serverId, channels, canManage, isAdmin }: {
    serverId: string;
    channels: (CommunityChannel & { unreadCount?: number })[];
    canManage: boolean;
    /** BotsPanel gates on this, not canManage (its endpoints are owner-or-ADMIN). */
    isAdmin: boolean;
}) {
    const utils = trpc.useUtils();
    const textChannels = channels.filter((c) => c.type === "TEXT");
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState("");
    const [channelId, setChannelId] = useState(textChannels[0]?.id ?? "");
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const { data: webhooks = [], isLoading } = trpc.community.listWebhooks.useQuery(
        { serverId },
        { enabled: canManage },
    );
    const createWebhook = trpc.community.createWebhook.useMutation({
        onSuccess: () => {
            utils.community.listWebhooks.invalidate({ serverId });
            setCreating(false);
            setName("");
            toast.success("Webhook created — copy its URL");
        },
        onError: (e) => toast.error(e.message),
    });
    const deleteWebhook = trpc.community.deleteWebhook.useMutation({
        onSuccess: () => utils.community.listWebhooks.invalidate({ serverId }),
    });

    const webhookUrl = (id: string, token: string) =>
        `${window.location.origin}/api/webhooks/community/${id}/${token}`;

    const copyUrl = (id: string, token: string) => {
        navigator.clipboard.writeText(webhookUrl(id, token));
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    if (!canManage) {
        return (
            <div>
                <SectionHint>Services connected to this server.</SectionHint>
                <div className="rounded-3xl bg-white/[0.03] p-8 text-center">
                    <p className="text-[16px] font-bold text-zinc-300">Mods only</p>
                    <p className="mx-auto mt-1 max-w-xs text-[14px] font-medium leading-relaxed text-zinc-500">
                        Webhooks carry posting credentials, so only admins and moderators can see them.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div>
            <SectionHint>
                Webhooks let outside services — GitHub, alerts, your own scripts — post messages into a channel. POST JSON{" "}
                <code className="rounded bg-white/[0.06] px-1 py-0.5 text-[12px]">{"{ content, username?, avatar_url? }"}</code> to the URL.
            </SectionHint>

            {/* Create */}
            {!creating ? (
                <ActionButton className="mb-7" onClick={() => setCreating(true)} disabled={textChannels.length === 0}>
                    <HugeiconsIcon icon={PlusSignIcon} className="size-4" strokeWidth={2} />
                    New webhook
                </ActionButton>
            ) : (
                <div className="mb-7 space-y-3 rounded-3xl bg-white/[0.03] p-4">
                    <Input
                        radius={12}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Webhook name — e.g. GitHub"
                        maxLength={50}
                        autoFocus
                        className="h-11 text-[14px] font-bold"
                    />
                    <div className="flex flex-wrap gap-1.5">
                        {textChannels.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => setChannelId(c.id)}
                                className={cn(
                                    "max-w-full cursor-pointer truncate rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
                                    channelId === c.id ? "bg-white text-black" : "bg-white/[0.06] text-zinc-400 hover:text-white",
                                )}
                            >
                                #{c.name}
                            </button>
                        ))}
                    </div>
                    <div className="flex justify-end gap-1.5">
                        <ActionButton variant="soft" className="h-11 px-4 text-[14px]" onClick={() => { setCreating(false); setName(""); }}>
                            Cancel
                        </ActionButton>
                        <ActionButton
                            className="h-11 px-4 text-[14px]"
                            onClick={() => createWebhook.mutate({ serverId, channelId, name })}
                            disabled={createWebhook.isPending || !name.trim() || !channelId}
                        >
                            {createWebhook.isPending ? "Creating…" : "Create webhook"}
                        </ActionButton>
                    </div>
                </div>
            )}

            {isLoading && (
                <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                        <div key={i} className="h-16 overflow-hidden rounded-2xl"><div className="size-full shimmer-skeleton" /></div>
                    ))}
                </div>
            )}

            {!isLoading && webhooks.length === 0 && (
                <div className="py-10 text-center">
                    <p className="text-[15px] font-bold text-zinc-400">No webhooks yet</p>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-600">
                        Create one and paste its URL into any service that can send a POST
                    </p>
                </div>
            )}

            <div className="space-y-2">
                {webhooks.map((w) => (
                    <div key={w.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3.5">
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-[14px] font-bold text-white">{w.name}</p>
                            <p className="truncate text-[12px] font-medium text-zinc-500">
                                #{w.channelName}
                                {w.lastUsedAt
                                    ? ` · last used ${formatDistanceToNow(new Date(w.lastUsedAt), { addSuffix: true })}`
                                    : " · never used"}
                            </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                            <ActionButton variant="soft" className="h-9 px-3.5 text-[13px]" onClick={() => copyUrl(w.id, w.token)}>
                                <HugeiconsIcon icon={copiedId === w.id ? Tick02Icon : Copy01Icon} className="size-3.5" strokeWidth={2.5} />
                                {copiedId === w.id ? "Copied" : "Copy URL"}
                            </ActionButton>
                            <button
                                onClick={() => deleteWebhook.mutate({ serverId, webhookId: w.id })}
                                disabled={deleteWebhook.isPending}
                                aria-label={`Delete ${w.name}`}
                                className="grid size-9 cursor-pointer place-items-center rounded-full text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-pastelred"
                            >
                                <HugeiconsIcon icon={Cancel01Icon} className="size-4" strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>
            <BotsPanel serverId={serverId} isAdmin={isAdmin} />
        </div>
    );
}

function AppsSection() {
    return (
        <div>
            <SectionHint>Apps and bots you can add to this server.</SectionHint>
            <div className="rounded-3xl bg-white/[0.03] p-8 text-center">
                <p className="text-[16px] font-bold text-zinc-300">Bots live under Integrations</p>
                <p className="mx-auto mt-1 max-w-xs text-[14px] font-medium leading-relaxed text-zinc-500">Developers install bots from the console; manage this server&apos;s from Integrations.</p>
            </div>
        </div>
    );
}

// ─── Safety setup ────────────────────────────────────────

const VERIFICATION_LEVELS: { value: "none" | "low" | "medium" | "high"; label: string; hint: string }[] = [
    { value: "none", label: "None", hint: "Everyone can post right away" },
    { value: "low", label: "Low", hint: "Accounts must be 10 minutes old" },
    { value: "medium", label: "Medium", hint: "Accounts must be a day old" },
    { value: "high", label: "High", hint: "Day-old account, in the server 10 minutes" },
];

function SafetySection({ server, isAdmin }: { server: CommunityServer; isAdmin: boolean }) {
    const [, setSection] = useSettingsSection();
    const { data: session } = useAuthSession();
    const utils = trpc.useUtils();
    const { data: bans = [] } = trpc.community.listBans.useQuery({ serverId: server.id });
    const automodCount = (server.automodKeywords ?? "").split(",").map((w) => w.trim()).filter(Boolean).length;
    const isOwner = session?.user?.id === server.ownerId;
    const viewerHas2fa = (session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled ?? false;

    const updateServer = useUpdateServer(server.id);
    const verification = server.verificationLevel ?? "none";

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
            <SectionHint>Who can post, and what it takes to moderate.</SectionHint>

            {isAdmin && (
                <div className="mb-3 rounded-3xl bg-white/[0.03] px-5 py-4">
                    <p className="text-[15px] font-bold text-white">Verification level</p>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                        What a regular member needs before they can post. Mods and admins are exempt.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                        {VERIFICATION_LEVELS.map((l) => (
                            <button
                                key={l.value}
                                onClick={() => updateServer.mutate({ serverId: server.id, verificationLevel: l.value })}
                                className={cn(
                                    "h-10 cursor-pointer rounded-full px-4 text-[14px] font-bold transition-colors",
                                    verification === l.value
                                        ? "bg-white text-black"
                                        : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white",
                                )}
                            >
                                {l.label}
                            </button>
                        ))}
                    </div>
                    <p className="mt-2 text-[13px] font-medium text-zinc-600">
                        {VERIFICATION_LEVELS.find((l) => l.value === verification)?.hint}
                    </p>
                </div>
            )}

            {isOwner && (
                <label className="mb-3 flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-white">Require 2FA for moderation</p>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            Kicks, bans, role changes, and channel deletes need two-factor auth on the moderator&apos;s account.
                        </p>
                        {!viewerHas2fa && !server.requireMod2fa && (
                            <Link
                                href="/settings?tab=2fa"
                                className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-400 transition-colors hover:text-white"
                            >
                                <LockIcon className="size-3.5 shrink-0" />
                                Set up 2FA on your own account first — it applies to you too
                            </Link>
                        )}
                    </div>
                    <Switch
                        checked={!!server.requireMod2fa}
                        onCheckedChange={(v) => updateServer.mutate({ serverId: server.id, requireMod2fa: v })}
                        disabled={updateServer.isPending || (!viewerHas2fa && !server.requireMod2fa)}
                    />
                </label>
            )}

            {/* Mods see where they stand when the server enforces 2FA */}
            {!isOwner && server.requireMod2fa && (
                <div className="mb-3 flex items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4">
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-white">This server requires 2FA for moderation</p>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            {viewerHas2fa
                                ? "You're covered — your account has two-factor auth."
                                : "Kicks, bans, role changes, and channel deletes are locked until you enable two-factor auth."}
                        </p>
                        {!viewerHas2fa && (
                            <Link
                                href="/settings?tab=2fa"
                                className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-400 transition-colors hover:text-white"
                            >
                                <LockIcon className="size-3.5 shrink-0" />
                                Set up 2FA in account settings
                            </Link>
                        )}
                    </div>
                    {viewerHas2fa && <HugeiconsIcon icon={Tick02Icon} className="size-4 shrink-0 text-lantern" strokeWidth={2.5} />}
                </div>
            )}

            {isAdmin && (
                <label className="mb-3 flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-white">Blur media</p>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            Image attachments in chat stay blurred until a member clicks to reveal them.
                        </p>
                    </div>
                    <Switch
                        checked={!!server.blurMedia}
                        onCheckedChange={(v) => updateServer.mutate({ serverId: server.id, blurMedia: v })}
                    />
                </label>
            )}

            {isAdmin && (
                <label className="mb-6 flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[0.03] px-5 py-4 transition-colors hover:bg-white/[0.05]">
                    <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-bold text-white">Activity alerts</p>
                        <p className="mt-0.5 text-[13px] font-medium text-zinc-500">
                            Post a notice to the system channel when join activity spikes above normal.
                        </p>
                    </div>
                    <Switch
                        checked={!!server.activityAlerts}
                        onCheckedChange={(v) => updateServer.mutate({ serverId: server.id, activityAlerts: v })}
                    />
                </label>
            )}

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

// ─── Server template ─────────────────────────────────────

function TemplateSection({ server }: { server: CommunityServer }) {
    const utils = trpc.useUtils();
    const [copied, setCopied] = useState(false);
    const generateTemplate = trpc.community.generateTemplate.useMutation({
        onSuccess: () => utils.community.getServer.invalidate({ serverId: server.id }),
        onError: (err) => toast.error(err.message),
    });

    const templateUrl = server.templateCode && typeof window !== "undefined"
        ? `${window.location.origin}/communities?template=${server.templateCode}`
        : null;

    const copy = () => {
        if (!templateUrl) return;
        void navigator.clipboard.writeText(templateUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div>
            <SectionHint>Share your setup — anyone with the link creates a new server pre-filled like yours.</SectionHint>

            <div className="mb-6 grid grid-cols-2 gap-2">
                <div className="rounded-3xl bg-white/[0.03] px-5 py-4">
                    <p className="text-[14px] font-semibold text-zinc-500">Templates copy</p>
                    <p className="mt-1.5 text-[14px] font-medium leading-relaxed text-zinc-300">
                        Channels and their order · AutoMod and safety settings · system message and notification defaults · server rules
                    </p>
                </div>
                <div className="rounded-3xl bg-white/[0.03] px-5 py-4">
                    <p className="text-[14px] font-semibold text-zinc-500">Templates never copy</p>
                    <p className="mt-1.5 text-[14px] font-medium leading-relaxed text-zinc-300">
                        Messages · members · emoji and stickers · boosts · your icon and profile
                    </p>
                </div>
            </div>

            {templateUrl ? (
                <div className="flex items-center gap-2">
                    <Input radius={14} readOnly value={templateUrl} onFocus={(e) => e.target.select()} className="h-13 flex-1 text-[14px] text-zinc-300" />
                    <ActionButton variant={copied ? "soft" : "primary"} className="h-13 shrink-0 px-5" onClick={copy}>
                        <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} className="size-4" strokeWidth={2} />
                        {copied ? "Copied" : "Copy"}
                    </ActionButton>
                </div>
            ) : (
                <ActionButton onClick={() => generateTemplate.mutate({ serverId: server.id })} disabled={generateTemplate.isPending}>
                    {generateTemplate.isPending ? "Generating…" : "Generate template"}
                </ActionButton>
            )}
        </div>
    );
}

// ─── Audit log ───────────────────────────────────────────

const AUDIT_FILTERS: { label: string; prefixes: string[] | null }[] = [
    { label: "All", prefixes: null },
    { label: "Server", prefixes: ["server.", "access.", "invite."] },
    { label: "Channels", prefixes: ["channel."] },
    { label: "Members", prefixes: ["member."] },
    { label: "Expressions", prefixes: ["expression."] },
];

function AuditSection({ serverId }: { serverId: string }) {
    const [filter, setFilter] = useState("All");
    const [actorFilter, setActorFilter] = useState<string | null>(null);
    const { data: allEntries = [], isLoading } = trpc.community.getAuditLog.useQuery({ serverId });

    const prefixes = AUDIT_FILTERS.find((f) => f.label === filter)?.prefixes ?? null;
    const entries = allEntries
        .filter((e) => !prefixes || prefixes.some((p) => e.action.startsWith(p)))
        .filter((e) => !actorFilter || e.actorUserId === actorFilter);

    // Everyone who appears in the log → the user filter
    const actors = [...new Map(allEntries.map((e) => [e.actorUserId, e.actorName])).entries()];

    return (
        <div>
            <SectionHint>Every management action on this server, newest first.</SectionHint>

            <div className="mb-4 flex flex-wrap items-center gap-1.5">
                {AUDIT_FILTERS.map((f) => (
                    <button
                        key={f.label}
                        onClick={() => setFilter(f.label)}
                        className={cn(
                            "h-9 cursor-pointer rounded-full px-4 text-[13px] font-bold transition-colors",
                            filter === f.label
                                ? "bg-white text-black"
                                : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white",
                        )}
                    >
                        {f.label}
                    </button>
                ))}
                {actors.length > 1 && (
                    <GooDropdown
                        side="bottom"
                        align="end"
                        width={190}
                        gap={6}
                        buttonRadius={16}
                        triggerAriaLabel="Filter by user"
                        triggerClassName="ml-auto flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white/5 px-4 text-[13px] font-bold text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                        trigger={
                            <>
                                {actorFilter ? (actors.find(([id]) => id === actorFilter)?.[1] ?? "User") : "All users"}
                                <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-zinc-500" strokeWidth={2} />
                            </>
                        }
                        items={[
                            {
                                key: "all",
                                onClick: () => setActorFilter(null),
                                className: "text-[13px] font-medium text-zinc-100 hover:bg-white/10",
                                label: <>All users</>,
                            },
                            ...actors.map(([id, name]) => ({
                                key: id,
                                onClick: () => setActorFilter(id),
                                className: "text-[13px] font-medium text-zinc-100 hover:bg-white/10",
                                label: <>{name ?? "Unknown"}</>,
                            })),
                        ]}
                    />
                )}
            </div>

            {isLoading && (
                <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="h-12 overflow-hidden rounded-[16px]"><div className="size-full shimmer-skeleton" /></div>
                    ))}
                </div>
            )}

            {!isLoading && entries.length === 0 && (
                <div className="py-10 text-center">
                    <p className="text-[15px] font-bold text-zinc-400">{allEntries.length ? "Nothing in this category" : "Nothing logged yet"}</p>
                    <p className="mt-0.5 text-[13px] font-medium text-zinc-600">
                        {allEntries.length ? "Try another filter" : "Channel, member, and server changes show up here"}
                    </p>
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
