"use client";

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShieldIcon } from "@hugeicons/core-free-icons";

import { trpc } from "@/lib/trpc/client";

// The Mod Actions feed (studio S2 panel 7) — the moderation audit trail.
//
// Until now every moderation verb mutated state and left nothing behind: a
// creator could see WHO is banned, never who banned them or why, and with
// moderators in the channel that is the difference between a tool and a black
// box. Backed by moderation.getModActions over the new moderation_actions
// table (db/studio-mod-actions.sql).
//
// It starts EMPTY for everyone, permanently as far as history goes — nothing
// recorded these actions before the table existed, so there is nothing to
// backfill. The empty state says so rather than implying a quiet channel.

const VERB: Record<string, string> = {
    ban: "banned",
    unban: "unbanned",
    mod_add: "made a moderator",
    mod_remove: "removed as moderator",
    vip_add: "made a VIP",
    vip_remove: "removed as VIP",
    chat_mode: "set chat to",
    pin_message: "",
};

/** Channel-wide actions have no target — the detail carries the meaning. */
const CHANNEL_WIDE = new Set(["chat_mode", "pin_message"]);

function ago(at: Date | string): string {
    const then = typeof at === "string" ? new Date(at) : at;
    const secs = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    if (secs < 86_400) return `${Math.floor(secs / 3600)}h`;
    return `${Math.floor(secs / 86_400)}d`;
}

export function ModActionsFeed({ isLive, action }: { isLive: boolean; action?: React.ReactNode }) {
    const log = trpc.moderation.getModActions.useQuery(
        { limit: 20 },
        { refetchInterval: isLive ? 30_000 : false, staleTime: 30_000 },
    );

    const rows = log.data ?? [];

    return (
        <div className="flex flex-col rounded-2xl border border-border/60 bg-card">
            <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
                <HugeiconsIcon icon={ShieldIcon} className="size-3.5 text-muted-foreground" />
                <p className="text-sm font-medium">Mod actions</p>
                <div className="ml-auto">{action}</div>
            </div>

            <div className="max-h-[260px] overflow-y-auto">
                {log.isPending ? (
                    <div className="flex flex-col gap-2 p-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-8 animate-pulse rounded-xl bg-muted/30" />
                        ))}
                    </div>
                ) : log.error ? (
                    <p className="p-4 text-xs text-muted-foreground">{log.error.message}</p>
                ) : rows.length === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground">
                        Bans, role changes, pins and chat-mode changes are recorded here from
                        now on — anything done before this log existed left no trace.
                    </p>
                ) : (
                    <ul className="flex flex-col">
                        {rows.map((r) => {
                            const who = r.actor?.name ?? r.actor?.username ?? "A moderator";
                            const target = r.target?.name ?? r.target?.username;
                            return (
                                <li key={r.id} className="flex items-start gap-2 px-4 py-2.5">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs">
                                            <span className="font-medium">{who}</span>{" "}
                                            <span className="text-muted-foreground">
                                                {VERB[r.action] ?? r.action}
                                            </span>
                                            {!CHANNEL_WIDE.has(r.action) && target ? (
                                                <span className="font-medium"> {target}</span>
                                            ) : null}
                                            {r.action === "chat_mode" && r.detail ? (
                                                <span className="font-medium"> {r.detail}</span>
                                            ) : null}
                                            {r.action === "pin_message" && r.detail ? (
                                                <span className="text-muted-foreground"> {r.detail}</span>
                                            ) : null}
                                        </p>
                                        {/* A ban's reason is the whole point of auditing it. */}
                                        {r.action === "ban" && r.detail ? (
                                            <p className="truncate text-[11px] text-muted-foreground">
                                                “{r.detail}”
                                            </p>
                                        ) : null}
                                    </div>
                                    <span className="shrink-0 pt-0.5 text-[11px] tabular-nums text-muted-foreground">
                                        {ago(r.createdAt)}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
