"use client";

import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCommunityModal } from "@/hooks/use-community-modal";
import { useAuthSession } from "@/hooks/use-auth-session";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import {
    SETTINGS_SECTIONS,
    sectionLabel,
    useSettingsSection,
    type SettingsSection,
} from "./server-settings-nav";

// Settings rail — same column anatomy as the server sidebar (w-76,
// bg-zinc-900/60): back row on top, grouped section rows, red delete at
// the bottom for the owner.
export function ServerSettingsSidebar({ serverId }: { serverId: string }) {
    const router = useRouter();
    const { data: session } = useAuthSession();
    const { onOpen } = useCommunityModal();
    const { data } = trpc.community.getServer.useQuery({ serverId });
    const [section, setSection] = useSettingsSection();

    const role = data?.currentMember.role;
    const isAdmin = role === "ADMIN";
    const isOwner = !!data && data.server.ownerId === session?.user?.id;

    const groups: { label: string; rows: SettingsSection[] }[] = data
        ? [
              {
                  label: data.server.name,
                  rows: [
                      ...(isAdmin ? (["profile"] as const) : []),
                      "engagement",
                      "boosts",
                  ],
              },
              { label: "People", rows: ["members", "roles", "invites", "bans"] },
              { label: "Channels", rows: ["channels"] },
              {
                  label: "Moderation",
                  rows: [...(isAdmin ? (["automod"] as const) : []), "audit"],
              },
          ]
        : [];

    const active: SettingsSection =
        !isAdmin && (section === "profile" || section === "automod") ? "engagement" : section;

    return (
        <div className="flex flex-col h-full w-76 shrink-0 bg-zinc-900/60 overflow-hidden">
            {/* Back — mirrors the server-header row anatomy */}
            <button
                onClick={() => router.push(`/communities/${serverId}`)}
                className="w-full text-md cursor-pointer font-semibold px-3 py-4.5 flex items-center gap-2 hover:bg-zinc-900 transition text-white"
            >
                <HugeiconsIcon icon={ArrowLeft01Icon} className="h-5 w-5 text-zinc-400" strokeWidth={2} />
                <span className="truncate">{data?.server.name ?? "Server settings"}</span>
            </button>

            <ScrollArea className="flex-1">
                <div className="px-2 pb-4">
                    {data ? (
                        groups.map((g) => (
                            <div key={g.label} className="mb-4">
                                <p className="truncate px-3 pb-1 pt-2 text-[12px] font-bold text-zinc-500">{g.label}</p>
                                <div className="space-y-[2px]">
                                    {g.rows.map((key) => (
                                        <button
                                            key={key}
                                            onClick={() => setSection(key)}
                                            className={cn(
                                                "flex h-10 w-full cursor-pointer items-center rounded-lg px-3 text-sm font-medium transition",
                                                active === key
                                                    ? "bg-white/[0.07] text-flexwhite"
                                                    : "text-flexwhite/50 hover:bg-white/5 hover:text-flexwhite/80",
                                            )}
                                        >
                                            {sectionLabel(key)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex flex-col gap-2 px-1 pt-2">
                            {Array.from({ length: SETTINGS_SECTIONS.length }).map((_, i) => (
                                <div key={i} className="h-10 overflow-hidden rounded-lg"><div className="size-full shimmer-skeleton" /></div>
                            ))}
                        </div>
                    )}

                    {isOwner && (
                        <div className="mt-2 border-t border-white/5 pt-3">
                            <button
                                onClick={() => data && onOpen("deleteServer", { server: data.server })}
                                className="flex h-10 w-full cursor-pointer items-center rounded-lg px-3 text-sm font-medium text-pastelred transition hover:bg-pastelred/10"
                            >
                                Delete server
                            </button>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
