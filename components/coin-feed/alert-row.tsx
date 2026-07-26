"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Megaphone01Icon, RocketIcon, ChartBreakoutCircleIcon, Bitcoin01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Squircle } from "@/components/ui/squircle";
import { TraderStack } from "./trader-stack";
import { alertHref, formatAge, formatUsd, KIND_META } from "./alert-format";
import type { AlertEvent } from "./types";

// One alert row. Two lines, per the reference:
//
//   [faces]  20 traders (buy) $40.3K              5m
//            (o) PUPPY at $612K MC
//
// The whole row is one link — no nested interactive elements — because at 280px
// there is no room for per-row actions and a nested button would break the
// click target anyway.

const TONE_BADGE: Record<"up" | "down" | "neutral", string> = {
    up: "bg-jewel/15 text-jewel",
    down: "bg-pastelred/15 text-pastelred",
    neutral: "bg-white/8 text-zinc-300",
};

/** Icon standing in for the coin on kinds that have no coin image. */
function KindIcon({ kind }: { kind: AlertEvent["kind"] }) {
    const icon =
        kind === "callout" ? Megaphone01Icon
        : kind === "prediction" ? ChartBreakoutCircleIcon
        : kind === "launch" ? RocketIcon
        : Bitcoin01Icon;
    return (
        <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-white/8">
            <HugeiconsIcon icon={icon} className="size-2.5 text-zinc-400" strokeWidth={2.5} />
        </span>
    );
}

function CoinMark({ event }: { event: AlertEvent }) {
    if (event.tokenImageUrl) {
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={event.tokenImageUrl}
                alt=""
                loading="lazy"
                className="size-4.5 shrink-0 rounded-full object-cover"
            />
        );
    }
    return <KindIcon kind={event.kind} />;
}

/** The headline half of the row — what happened, and how big. */
function Headline({ event }: { event: AlertEvent }) {
    const meta = KIND_META[event.kind];
    const badge = meta.badge ? (
        <span className={cn("shrink-0 rounded px-1 py-px text-[11px] font-bold leading-[15px]", TONE_BADGE[meta.tone])}>
            {meta.badge}
        </span>
    ) : null;

    switch (event.kind) {
        case "cluster_buy":
        case "cluster_sell":
            return (
                <>
                    <span className="shrink-0 font-bold text-white">{event.traderCount} traders</span>
                    {badge}
                    <span className="truncate font-bold text-white tabular-nums">{formatUsd(event.usdValue)}</span>
                </>
            );
        case "whale_buy":
        case "whale_sell":
            return (
                <>
                    <span className="shrink-0 font-bold text-white">whale</span>
                    {badge}
                    <span className="truncate font-bold text-white tabular-nums">{formatUsd(event.usdValue)}</span>
                </>
            );
        case "launch":
            return (
                <>
                    <span className="shrink-0 font-bold text-white">launched</span>
                    {badge}
                </>
            );
        case "migration":
            return (
                <>
                    <span className="shrink-0 font-bold text-white">bonded</span>
                    {badge}
                </>
            );
        case "callout":
            return (
                <>
                    <span className="shrink-0 font-bold text-white">called out</span>
                    {badge}
                </>
            );
        case "prediction":
            return (
                <>
                    <span className="shrink-0 font-bold text-white">new market</span>
                    {badge}
                </>
            );
    }
}

/** The context half — which coin, at what cap. Predictions swap it for the
 *  question, since they have no coin. */
function Subline({ event }: { event: AlertEvent }) {
    if (event.kind === "prediction") {
        return (
            <span className="flex min-w-0 items-center gap-1.5">
                <CoinMark event={event} />
                <span className="truncate text-zinc-400">{event.title ?? event.symbol}</span>
            </span>
        );
    }

    return (
        <span className="flex min-w-0 items-center gap-1.5">
            <CoinMark event={event} />
            <span className="shrink-0 font-bold text-white">{event.symbol}</span>
            {event.marketCapUsd != null && (
                <>
                    <span className="shrink-0 text-zinc-500">at</span>
                    <span className="shrink-0 font-bold tabular-nums text-zinc-200">{formatUsd(event.marketCapUsd)}</span>
                    <span className="shrink-0 text-zinc-500">mc</span>
                </>
            )}
        </span>
    );
}

export function AlertRow({ event }: { event: AlertEvent }) {
    const target = alertHref(event);

    const body = (
        <>
            <TraderStack traders={event.traders} total={event.traderCount} className="mt-0.5" />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-tight">
                    <Headline event={event} />
                    {/* ml-auto, not a fixed column: the headline's own width
                        varies a lot and the age should hug the right edge. */}
                    <span className="ml-auto shrink-0 pl-1 text-[12px] font-medium tabular-nums text-zinc-500">
                        {formatAge(event.occurredAt)}
                    </span>
                </span>
                <span className="flex min-w-0 items-center text-[13px] leading-tight">
                    <Subline event={event} />
                </span>
            </span>
        </>
    );

    const className = cn(
        "flex w-full items-start gap-2.5 px-2 py-2.5 text-left transition-colors",
        "hover:bg-sidebar-hover-35/60",
    );

    // No link target (a tracked coin on a chain with no explorer configured):
    // render the same row, just inert, rather than dropping the alert.
    if (!target) {
        return (
            <Squircle asChild radius={12} autoEffects={false}>
                <div className={className}>{body}</div>
            </Squircle>
        );
    }

    return (
        <Squircle asChild radius={12} autoEffects={false}>
            <Link
                href={target.href}
                {...(target.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={cn(className, "cursor-pointer")}
            >
                {body}
            </Link>
        </Squircle>
    );
}
