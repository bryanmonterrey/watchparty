"use client";

import * as React from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserAdd01Icon, ChartUpIcon, Megaphone01Icon, QuoteUpIcon, StarIcon } from "@hugeicons/core-free-icons";

import { trpc } from "@/lib/trpc/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// The cockpit's Activity Feed (studio S2, panel 6) — the differentiator the
// execution plan calls for: not just follows, but watchparty's ON-CHAIN events
// beside them, in one timeline.
//
// Backed by notification.getNotifications with its `types` filter, so the feed
// is a real query rather than a client-side sieve over a page of likes.
//
// SUBSCRIBERS MERGE IN from a second query, because they are not notifications
// — nothing writes a notification row when a subscription starts. They carry
// their own `createdAt` (the table always had one; getMySubscribers simply
// never selected it, and ordered by currentPeriodEnd, which moves on every
// renewal and would rank the longest-committed subscriber as the newest).
//
// Merged client-side rather than in SQL: two tables with different shapes,
// both small and already fetched for this page, and a UNION would need a
// materialised view to stay cheap. Sorted on one timestamp, so the timeline is
// real either way.

/** Creator-relevant types, from notify.ts's NotifType union. */
const ACTIVITY_TYPES = ["follow", "trade", "callout", "quote"] as const;

const MEANING: Record<string, { icon: typeof UserAdd01Icon; verb: string; tone: string }> = {
    follow: { icon: UserAdd01Icon, verb: "followed you", tone: "text-twitter2" },
    trade: { icon: ChartUpIcon, verb: "traded your coin", tone: "text-lantern" },
    callout: { icon: Megaphone01Icon, verb: "called you out", tone: "text-amber-500" },
    quote: { icon: QuoteUpIcon, verb: "quoted your post", tone: "text-muted-foreground" },
    subscribe: { icon: StarIcon, verb: "subscribed", tone: "text-twitter2" },
};

/** One row of the merged timeline, whichever table it came from. */
type Event = {
    id: string;
    kind: string;
    at: Date;
    body: string | null;
    actor: { name: string | null; username: string | null; avatar_url: string | null } | null;
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

export function ActivityFeed({ isLive, action }: { isLive: boolean; action?: React.ReactNode }) {
    // Fast while it matters, idle when it doesn't: a live broadcast is exactly
    // when a creator watches this, and the same poll off-air is pure cost.
    const feed = trpc.notification.getNotifications.useQuery(
        { limit: 20, types: [...ACTIVITY_TYPES] },
        { refetchInterval: isLive ? 20_000 : 120_000, staleTime: 15_000 },
    );

    // Subscriptions change far less often than chat does; the feed's own poll
    // is what keeps the merged list fresh enough.
    const subs = trpc.subscription.getMySubscribers.useQuery(undefined, {
        refetchInterval: isLive ? 60_000 : 300_000,
        staleTime: 60_000,
    });

    const items: Event[] = React.useMemo(() => {
        const events: Event[] = (feed.data?.notifications ?? []).map((n) => ({
            id: n.id,
            kind: n.type,
            at: new Date(n.createdAt),
            body: n.body,
            actor: n.actor,
        }));
        for (const s of subs.data ?? []) {
            events.push({
                id: `sub-${s.id}`,
                kind: "subscribe",
                at: new Date(s.createdAt),
                body: s.tier?.name ?? null,
                actor: s.subscriber,
            });
        }
        return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 20);
    }, [feed.data, subs.data]);

    return (
        <div className="flex flex-col rounded-2xl border border-border/60 bg-card">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                <p className="text-sm font-medium">Activity</p>
                <div className="flex items-center gap-2">
                    {isLive ? (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="size-1.5 animate-pulse rounded-full bg-red-500" />
                            Live
                        </span>
                    ) : null}
                    {action}
                </div>
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
                        Follows, subscriptions, quotes and trades on your coin land here as
                        they happen.
                    </p>
                ) : (
                    <ul className="flex flex-col">
                        {items.map((n) => {
                            const meaning = MEANING[n.kind] ?? MEANING.follow;
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
                                        {ago(n.at)}
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
