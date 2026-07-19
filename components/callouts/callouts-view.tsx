"use client";

import * as React from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Megaphone } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatMarketCap } from "@/components/tokens/market-cap-chip";
import { trpc } from "@/lib/trpc/client";
import { TradeRow } from "@/components/trades/trade-row";
import { MiniProfile } from "@/components/profile/mini-profile-card";
import { MyCopies } from "@/components/copy/my-copies";
import { cn } from "@/lib/utils";

// Callouts surface (docs/exp-callouts.md, Phase 2): live global feed of calls
// + the 7-day caller leaderboard. Reads poll every 30s — the cron advances
// peak gains every 10 min, so realtime push isn't worth its weight here yet.

function GainBadge({ gain, className }: { gain: number; className?: string }) {
    const pct = gain * 100;
    const label = `${pct >= 0 ? "+" : ""}${pct >= 100 ? Math.round(pct) : pct.toFixed(1)}%`;
    return (
        <span
            className={cn(
                "rounded-full px-2.5 py-1 text-xs font-bold tabular-nums",
                pct > 0.5 ? "bg-lantern/10 text-lantern" : pct < -0.5 ? "bg-pastelred/10 text-pastelred" : "bg-white/5 text-zinc-400",
                className,
            )}
        >
            {label}
        </span>
    );
}

function CallerIdentity({ caller }: { caller: { id?: string; userId?: string; name: string; username: string | null; avatar_url: string | null; level: number } }) {
    return (
        <MiniProfile userId={caller.id ?? caller.userId} triggerClassName="min-w-0">
            <Link href={`/${caller.username ?? ""}`} className="flex items-center gap-2.5 min-w-0 group">
                <Avatar className="size-9 border border-zinc-700/50 shrink-0">
                    <AvatarImage src={caller.avatar_url || undefined} />
                    <AvatarFallback className="bg-zinc-800 text-zinc-400 text-xs font-bold">
                    </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-white group-hover:underline">{caller.name}</span>
                        <span className="font-pixel text-[10px] leading-none text-lantern shrink-0">LV {caller.level}</span>
                    </div>
                    {caller.username && <span className="text-xs text-zinc-500 font-medium">@{caller.username}</span>}
                </div>
            </Link>
        </MiniProfile>
    );
}

function CalloutsFeed() {
    const { data, isLoading } = trpc.callout.feed.useQuery({ limit: 30 }, { refetchInterval: 30_000 });

    if (isLoading) {
        return (
            <div className="flex flex-col gap-2">
                {Array.from({ length: 6 }, (_, i) => <div key={i} className="shimmer-skeleton h-[72px] rounded-[20px]" />)}
            </div>
        );
    }
    if (!data || data.items.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
                <Megaphone className="size-8 text-zinc-600" />
                <p className="text-sm font-semibold text-zinc-400">No callouts yet — be the first to call a token from its page.</p>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2">
            {data.items.map((c) => (
                <div key={c.id} className="flex items-center gap-3 rounded-[20px] bg-panel px-4 py-3">
                    <CallerIdentity caller={c.caller} />
                    <span className="hidden sm:block text-xs font-semibold text-zinc-500 shrink-0">called</span>
                    <Link href={`/${c.token.id}`} className="flex items-center gap-2 min-w-0 group">
                        <div className="size-8 rounded-lg bg-zinc-800 overflow-hidden shrink-0 border border-zinc-700/40">
                            {c.token.imageUrl && <img src={c.token.imageUrl} alt={c.token.name} className="size-full object-cover" />}
                        </div>
                        <div className="min-w-0">
                            <span className="block truncate text-sm font-bold text-white group-hover:underline">${c.token.ticker}</span>
                            <span className="block text-xs text-zinc-500 font-medium tabular-nums">
                                at {c.marketCapAtCall ? formatMarketCap(c.marketCapAtCall) : "—"} mcap
                            </span>
                        </div>
                    </Link>
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                        <GainBadge gain={Math.max(c.peakGainPct, c.currentGainPct)} />
                        <span className="hidden md:block text-xs text-zinc-500 font-medium w-16 text-right">
                            {formatDistanceToNow(new Date(c.createdAt), { addSuffix: false })}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    );
}

function CalloutsLeaderboard() {
    const { data, isLoading } = trpc.callout.leaderboard.useQuery(undefined, { refetchInterval: 60_000 });

    if (isLoading) {
        return (
            <div className="flex flex-col gap-2">
                {Array.from({ length: 5 }, (_, i) => <div key={i} className="shimmer-skeleton h-[64px] rounded-[20px]" />)}
            </div>
        );
    }
    if (!data || data.callers.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
                <Megaphone className="size-8 text-zinc-600" />
                <p className="text-sm font-semibold text-zinc-400">The 7-day board is empty — good calls land here.</p>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2">
            {data.callers.map((c, i) => (
                <div key={c.userId} className="flex items-center gap-3 rounded-[20px] bg-panel px-4 py-3">
                    <span className={cn("w-7 text-center font-pixel text-sm shrink-0", i === 0 ? "text-sunset" : i < 3 ? "text-zinc-200" : "text-zinc-500")}>
                        {i + 1}
                    </span>
                    <CallerIdentity caller={c} />
                    <div className="ml-auto flex items-center gap-4 shrink-0 text-right">
                        <div className="hidden sm:block">
                            <span className="block text-sm font-bold text-white tabular-nums">{c.calls}</span>
                            <span className="block text-[11px] text-zinc-500 font-medium">calls</span>
                        </div>
                        <div className="hidden sm:block">
                            <GainBadge gain={c.bestGainPct} />
                            <span className="block mt-0.5 text-[11px] text-zinc-500 font-medium">best call</span>
                        </div>
                        <div>
                            <span className="block text-sm font-bold text-lantern tabular-nums">{(c.score * 100).toFixed(0)}</span>
                            <span className="block text-[11px] text-zinc-500 font-medium">score</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function TradersLeaderboard() {
    const { data, isLoading } = trpc.pnl.leaderboard.useQuery({ window: "7d" }, { refetchInterval: 60_000 });

    if (isLoading) {
        return (
            <div className="flex flex-col gap-2">
                {Array.from({ length: 5 }, (_, i) => <div key={i} className="shimmer-skeleton h-[64px] rounded-[20px]" />)}
            </div>
        );
    }
    if (!data || data.traders.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
                <Megaphone className="size-8 text-zinc-600" />
                <p className="text-sm font-semibold text-zinc-400">
                    No public traders yet — turn on &quot;Share trades&quot; on your profile to compete here.
                </p>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2">
            {data.traders.map((t, i) => (
                <div key={t.userId} className="flex items-center gap-3 rounded-[20px] bg-panel px-4 py-3">
                    <span className={cn("w-7 text-center font-pixel text-sm shrink-0", i === 0 ? "text-sunset" : i < 3 ? "text-zinc-200" : "text-zinc-500")}>
                        {i + 1}
                    </span>
                    <CallerIdentity caller={t} />
                    <div className="ml-auto flex items-center gap-4 shrink-0 text-right">
                        <div className="hidden sm:block">
                            <span className="block text-sm font-bold text-white tabular-nums">{t.tradeCount}</span>
                            <span className="block text-[11px] text-zinc-500 font-medium">trades</span>
                        </div>
                        <div className="hidden sm:block">
                            <span className="block text-sm font-bold text-white tabular-nums">
                                {t.winRate != null ? `${Math.round(t.winRate * 100)}%` : "—"}
                            </span>
                            <span className="block text-[11px] text-zinc-500 font-medium">win rate</span>
                        </div>
                        <div>
                            <span className={cn("block text-sm font-bold tabular-nums", t.realizedUsd + t.unrealizedUsd >= 0 ? "text-lantern" : "text-pastelred")}>
                                {t.realizedUsd + t.unrealizedUsd >= 0 ? "+" : "-"}${Math.abs(Math.round(t.realizedUsd + t.unrealizedUsd)).toLocaleString()}
                            </span>
                            <span className="block text-[11px] text-zinc-500 font-medium">7d PnL</span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

function LiveTradesFeed() {
    const { data, isLoading } = trpc.pnl.tradesFeed.useQuery({ limit: 30 }, { refetchInterval: 30_000 });

    if (isLoading) {
        return (
            <div className="flex flex-col gap-2">
                {Array.from({ length: 6 }, (_, i) => <div key={i} className="shimmer-skeleton h-[64px] rounded-[20px]" />)}
            </div>
        );
    }
    if (!data || data.items.length === 0) {
        return (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
                <Megaphone className="size-8 text-zinc-600" />
                <p className="text-sm font-semibold text-zinc-400">
                    No public trades yet — sharing traders&apos; buys and sells land here live.
                </p>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-2">
            <MyCopies />
            {data.items.map((t) => <TradeRow key={t.id} t={t} />)}
        </div>
    );
}

export function CalloutsView() {
    const [tab, setTab] = React.useState<"feed" | "leaderboard" | "traders" | "trades">("feed");

    return (
        <div className="mx-auto w-full max-w-3xl px-4 pt-header pb-10 flex flex-col gap-4 text-zinc-100">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="relative inline-flex rounded-full bg-[#16181c] p-1 text-sm font-semibold shadow-inner self-start">
                    {(["feed", "leaderboard", "traders", "trades"] as const).map((t) => {
                        const active = tab === t;
                        return (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={cn(
                                    "relative z-10 px-4 sm:px-5 py-3 rounded-full text-xs sm:text-sm font-bold transition-colors duration-200 select-none cursor-pointer focus:outline-none min-w-[96px]",
                                    active ? "text-black" : "text-zinc-400 hover:text-white",
                                )}
                            >
                                {t === "feed" ? "Callouts" : t === "leaderboard" ? "Top callers" : t === "traders" ? "Top traders" : "Live trades"}
                                {active && (
                                    <motion.div
                                        layoutId="callouts-toggle-bg"
                                        className="absolute inset-0 bg-white rounded-full -z-10"
                                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                    />
                                )}
                            </button>
                        );
                    })}
                </div>
                <p className="text-xs font-medium text-zinc-500">One callout per 6h — call from any token page.</p>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15, ease: "easeInOut" }}
                >
                    {tab === "feed" ? <CalloutsFeed /> : tab === "leaderboard" ? <CalloutsLeaderboard /> : tab === "traders" ? <TradersLeaderboard /> : <LiveTradesFeed />}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
