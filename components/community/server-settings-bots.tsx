"use client";

import { toast } from "sonner";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { BOT_PERMISSIONS, BOT_PERMISSION_META, hasPermission } from "@/lib/developer/bot-permissions";

// Installed bots + their per-community permission bitfield — the resource
// owner's control surface for developerBots.communityBots /
// communitySetPermissions / communityUninstall (extracted from
// server-settings.tsx per the file-size guard). Toggles write the SAME bits
// the bot-facing endpoints check, so what's granted here is exactly what the
// bot can do; changes apply on its next call (and silence its coin alerts at
// delivery time).
//
// Gates on isAdmin, NOT canManage: the endpoints are owner-or-ADMIN — a
// moderator gets FORBIDDEN.
export function BotsPanel({ serverId, isAdmin }: { serverId: string; isAdmin: boolean }) {
    const utils = trpc.useUtils();
    const { data: bots = [], isLoading } = trpc.developerBots.communityBots.useQuery(
        { serverId },
        { enabled: isAdmin },
    );
    const invalidate = () => utils.developerBots.communityBots.invalidate({ serverId });
    const setPerms = trpc.developerBots.communitySetPermissions.useMutation({
        onSuccess: invalidate,
        onError: (e) => toast.error(e.message),
    });
    const uninstall = trpc.developerBots.communityUninstall.useMutation({
        onSuccess: () => {
            invalidate();
            toast.success("Bot removed");
        },
        onError: (e) => toast.error(e.message),
    });

    return (
        <div className="mt-10">
            <p className="text-base font-bold text-zinc-200">Bots</p>
            <p className="mb-4 mt-1 text-sm font-medium text-zinc-500">
                {isAdmin
                    ? "Bots installed in this server and exactly what each may do. Changes apply immediately."
                    : "Only the owner and admins can manage this server's bots."}
            </p>
            {!isAdmin ? null : isLoading ? (
                <div className="h-16 rounded-3xl bg-white/[0.03]" />
            ) : bots.length === 0 ? (
                <div className="rounded-3xl bg-white/[0.03] p-6 text-center">
                    <p className="mx-auto max-w-sm text-sm font-medium leading-relaxed text-zinc-500">
                        No bots here yet. Developers install them from the console — once one
                        arrives, you control its permissions and can remove it any time.
                    </p>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    {bots.map((b) => (
                        <div key={b.botUserId} className="rounded-3xl bg-white/[0.03] p-4">
                            <div className="flex items-center gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-base font-bold text-zinc-200">{b.name ?? "Bot"}</p>
                                    {b.username ? (
                                        <p className="truncate text-sm font-medium text-zinc-500">@{b.username}</p>
                                    ) : null}
                                </div>
                                <div className="flex-1" />
                                <button
                                    onClick={() => uninstall.mutate({ serverId, botUserId: b.botUserId })}
                                    disabled={uninstall.isPending}
                                    className="h-9 cursor-pointer rounded-full px-4 text-sm font-bold text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-pastelred"
                                >
                                    Remove
                                </button>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-1.5">
                                {BOT_PERMISSION_META.map((p) => {
                                    const bit = BOT_PERMISSIONS[p.name];
                                    const on = hasPermission(b.permissions, bit);
                                    return (
                                        <button
                                            key={p.name}
                                            title={p.desc}
                                            disabled={setPerms.isPending}
                                            onClick={() =>
                                                setPerms.mutate({
                                                    serverId,
                                                    botUserId: b.botUserId,
                                                    permissions: on ? b.permissions & ~bit : b.permissions | bit,
                                                })
                                            }
                                            className={cn(
                                                "h-8 cursor-pointer rounded-full px-3 text-sm font-bold transition-colors disabled:pointer-events-none disabled:opacity-40",
                                                on ? "bg-white text-black" : "bg-white/[0.06] text-zinc-400 hover:text-white",
                                            )}
                                        >
                                            {p.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
