"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Megaphone01Icon, RocketIcon, ChartBreakoutCircleIcon, Bitcoin01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { stableHoverColor } from "@/lib/stable-hover-color";
import { Squircle } from "@/components/ui/squircle";
import { TraderStack } from "./trader-stack";
import { alertHref, formatAge, formatUsd, KIND_META } from "./alert-format";
import type { AlertEvent } from "./types";

// One alert row. Two lines, per the reference:
//
//   [faces]  20 traders (buy) $40.3K              5m
//            (o) PUPPY at $612K MC
//
// The whole row is ONE target — no nested interactive elements — because at
// 280px there is no room for per-row actions and a nested button would break
// the click target anyway. A coin we can chart opens the overlay; anything else
// still navigates. See the branches at the bottom.

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
        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-white/8">
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
                className="size-4 shrink-0 rounded-full object-cover"
            />
        );
    }
    return <KindIcon kind={event.kind} />;
}

/** The headline half of the row — what happened, and how big. */
function Headline({ event }: { event: AlertEvent }) {
    const meta = KIND_META[event.kind];
    const badge = meta.badge ? (
        // Nearly as tall as the 13px text beside it, per the designs — that is
        // what makes the line scan as "N traders BUY $x" rather than reading the
        // chip as a footnote.
        <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[13px] font-medium leading-[16px]", TONE_BADGE[meta.tone])}>
            {meta.badge}
        </span>
    ) : null;

    switch (event.kind) {
        case "cluster_buy":
        case "cluster_sell":
            return (
                <>
                    <span className="shrink-0 font-medium text-white">{event.traderCount} traders</span>
                    {badge}
                    <span className="truncate font-medium text-white tabular-nums">{formatUsd(event.usdValue)}</span>
                </>
            );
        case "whale_buy":
        case "whale_sell":
            return (
                <>
                    <span className="shrink-0 font-medium text-white">Whale</span>
                    {badge}
                    <span className="truncate font-medium text-white tabular-nums">{formatUsd(event.usdValue)}</span>
                </>
            );
        case "launch":
            return (
                <>
                    <span className="shrink-0 font-medium text-white">Launched</span>
                    {badge}
                </>
            );
        case "migration":
            return (
                <>
                    <span className="shrink-0 font-medium text-white">Bonded</span>
                    {badge}
                </>
            );
        case "callout":
            return (
                <>
                    <span className="shrink-0 font-medium text-white">Called out</span>
                    {badge}
                </>
            );
        case "prediction":
            return (
                <>
                    <span className="shrink-0 font-medium text-white">New market</span>
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

    // "SYMBOL at $612K MC", per the alert designs — the filler words are what
    // make the line read as a sentence rather than a data row, and they're
    // dimmed so the symbol and the number still carry it. The symbol wears a
    // dotted underline, which is the design's cue that it's the thing you click.
    //
    // The symbol truncates instead of shrink-0, so a long ticker gives way
    // rather than pushing the market cap out of the row.
    return (
        <span className="flex min-w-0 items-center gap-1.5">
            <CoinMark event={event} />
            <span className="truncate font-medium text-white underline decoration-zinc-600 decoration-dotted underline-offset-4">
                {event.symbol}
            </span>
            {event.marketCapUsd != null && (
                <>
                    <span className="shrink-0 text-zinc-500">at</span>
                    <span className="shrink-0 font-medium tabular-nums text-white">{formatUsd(event.marketCapUsd)}</span>
                    <span className="shrink-0 text-zinc-500">MC</span>
                </>
            )}
        </span>
    );
}

export function AlertRow({ event }: { event: AlertEvent }) {
    const target = alertHref(event);

    const body = (
        <>
            {/* Palette hover, same as the video rail's rows (rail-row.tsx): a
                per-item tint washed over the squircle instead of the neutral
                fill. Keyed on the event id — the same id the rail dedupes and
                paginates on — so a row keeps its colour across refetches.

                Positioned, and the content isn't, so it paints over the row as
                a wash rather than sitting behind the text. That's the shipped
                look on the video rail; matching it is the point. */}
            <span
                aria-hidden
                style={{ backgroundColor: stableHoverColor(event.id) }}
                className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover/alert-hover:opacity-10"
            />
            <TraderStack traders={event.traders} total={event.traderCount} className="mt-0.5" />
            {/* 13px both lines, measured off the designs against the row's own
                content width — an earlier pass read that screenshot at the wrong
                scale and landed on 15. gap-1.5 between them; the two lines are
                one thought but shouldn't run together. */}
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex min-w-0 items-center gap-1.5 text-[13px] leading-tight">
                    <Headline event={event} />
                    {/* ml-auto, not a fixed column: the headline's own width
                        varies a lot and the age should hug the right edge. */}
                    <span className="ml-auto shrink-0 pl-1.5 text-[13px] font-medium tabular-nums text-zinc-500">
                        {formatAge(event.occurredAt)}
                    </span>
                </span>
                <span className="flex min-w-0 items-center text-[13px] leading-tight">
                    <Subline event={event} />
                </span>
            </span>
        </>
    );

    // The neutral hover fill is gone on purpose: the palette tint above
    // replaces it, exactly as it does on the video rail (there the two are
    // mutually exclusive via `!hoverColor && hover:bg-…`). `relative` is what
    // the tint's inset-0 resolves against.
    // A ruled list, per the designs: every row carries a divider and enough
    // vertical room that the two lines read as one block. last:border-b-0 so the
    // final row doesn't draw a line onto the shell's own bottom edge.
    //
    // px-3, not px-2: the list sits in a bordered box with a 25px radius, and
    // content at px-2 was almost touching the outline and cutting the corner.
    // `relative` is what the hover tint's inset-0 resolves against.
    const className = cn(
        "group/alert-hover relative flex w-full items-start gap-2.5 px-3 py-3 text-left transition-colors",
        "border-b border-white/[0.06] last:border-b-0",
    );

    // A coin we can chart goes to its PAGE, chain-qualified. The chart overlay
    // this used to open is gone; /coin resolves any coin on any chain now, so
    // there's a real page to send people to.
    //
    // /coin/<network>/<address> rather than the bare address: the alert feed
    // spans every chain we track and the same address can exist on several, so
    // naming the chain skips resolution entirely.
    if (event.tokenAddress) {
        return (
            <Squircle asChild radius={12} autoEffects={false}>
                <Link
                    href={`/coin/${event.network}/${event.tokenAddress}`}
                    className={cn(className, "cursor-pointer")}
                >
                    {body}
                </Link>
            </Squircle>
        );
    }

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
