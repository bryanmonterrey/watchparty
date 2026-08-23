"use client";

import * as React from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserAdd01Icon, ChartUpIcon, Megaphone01Icon, QuoteUpIcon } from "@hugeicons/core-free-icons";

import { trpc } from "@/lib/trpc/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// The cockpit's Activity Feed (studio S2, panel 6) — the differentiator the
// execution plan calls for: not just follows, but watchparty's ON-CHAIN events
// beside them, in one timeline.
//
// Backed by notification.getNotifications with its `types` filter, so the feed
// is a real query rather than a client-side sieve over a page of likes.
//
// WHAT IS DELIBERATELY ABSENT: new subscribers. `subscription.getMySubscribers`
// carries no subscribed-at timestamp — only `currentPeriodEnd` — so placing a
// subscriber on a timeline would mean inventing when it happened. The
// Subscribers stat tile above already reports the count honestly. If a
// `createdAt` lands on that table, subscriptions merge in here.

/** Creator-relevant types, from notify.ts's NotifType union. */
const ACTIVITY_TYPES = ["follow", "trade", "callout", "quote"] as const;

const MEANING: Record<string, { icon: typeof UserAdd01Icon; verb: string; tone: string }> = {
    follow: { icon: UserAdd01Icon, verb: "followed you", tone: "text-twitter2" },
    trade: { icon: ChartUpIcon, verb: "traded your coin", tone: "text-lantern" },
    callout: { icon: Megaphone01Icon, verb: "called you out", tone: "text-amber-500" },
    quote: { icon: QuoteUpIcon, verb: "quoted your post", tone: "text-muted-foreground" },
};

/** Compact relative age — the feed is scanned, not read. */
function ago(at: Date | string): string {
    const then = typeof at === "string" ? new Date(at) : at;
    const secs = Math.max(0, Math.round((Date.now() - then.getTime()) / 1000));
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    if (secs < 86_400) return `${Math.floor(secs / 3600)}h`;
    return `${Math.floor(secs / 86_400)}d`;
}

export function ActivityFeed({ isLive }: { isLive: boolean }) {
    // Fast while it matters, idle when it doesn't: a live broadcast is exactly
    // when a creator watches this, and the same poll off-air is pure cost.
    const feed = trpc.notification.getNotifications.useQuery(
        { limit: 20, types: [...ACTIVITY_TYPES] },
        { refetchInterval: isLive ? 20_000 : 120_000, staleTime: 15_000 },
    );

    const items = feed.data?.notifications ?? [];

    return (
        <div className="flex flex-col rounded-2xl border border-border/60 bg-card">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <p className="text-sm font-medium">Activity</p>
                {isLive ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                        Live
                    </span>
                ) : null}
            </div>

            <div className="max-h-[320px] min-h-[120px] overflow-y-auto">
                {feed.isPending ? (
                    <div className="flex flex-col gap-2 p-4">
                        {Array.from({ length: 4 }).map((_, i) => (
                            <div key={i} className="h-9 animate-pulse rounded-xl bg-muted/30" />
                        ))}
                    </div>
                ) : feed.error ? (
                    <p className="p-4 text-xs text-muted-foreground">{feed.error.message}</p>
                ) : items.length === 0 ? (
                    <p className="p-4 text-xs text-muted-foreground">
                        Follows, quotes and trades on your coin land here as they happen.
                    </p>
                ) : (
                    <ul className="flex flex-col">
                        {items.map((n) => {
                            const meaning = MEANING[n.type] ?? MEANING.follow;
                            const name = n.actor?.name ?? n.actor?.username ?? "Someone";
                            return (
                                <li
                                    key={n.id}
                                    className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-accent/40"
                                >
                                    <Avatar className="size-7 shrink-0">
                                        <AvatarImage src={n.actor?.avatar_url ?? undefined} alt="" />
                                        <AvatarFallback />
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-xs">
                                            {n.actor?.username ? (
                                                <Link
                                                    href={`/${n.actor.username}`}
                                                    className="font-medium hover:underline"
                                                >
                                                    {name}
                                                </Link>
                                            ) : (
                                                <span className="font-medium">{name}</span>
                                            )}{" "}
                                            <span className="text-muted-foreground">{meaning.verb}</span>
                                        </p>
                                        {n.body ? (
                                            <p className="truncate text-[11px] text-muted-foreground">{n.body}</p>
                                        ) : null}
                                    </div>
                                    <HugeiconsIcon
                                        icon={meaning.icon}
                                        className={`size-3.5 shrink-0 ${meaning.tone}`}
                                    />
                                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                        {ago(n.createdAt)}
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
