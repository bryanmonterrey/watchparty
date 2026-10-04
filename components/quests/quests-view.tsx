"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check } from "lucide-react";
import { trpc } from "@/lib/trpc/client";
import { xpProgress } from "@/lib/xp";
import { cn } from "@/lib/utils";

// Quests panel (docs/exp-callouts.md, Phase 3). Progress advances server-side
// as actions happen and completion auto-claims XP — this page is a pure view.

function formatCountdown(to: Date): string {
    const s = Math.max(0, Math.floor((to.getTime() - Date.now()) / 1000));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Same visual language as the profile exp bar: lined-up ticks, hue sweep fill.
function TickProgress({ progress, target }: { progress: number; target: number }) {
    const ticks = target <= 10 ? target : 20;
    const filled = Math.round((Math.min(progress, target) / target) * ticks);
    return (
        <div className="flex items-center gap-[3px]">
            {Array.from({ length: ticks }, (_, i) => (
                <span
                    key={i}
                    className={cn("h-2.5 rounded-full", target <= 10 ? "w-2" : "w-[3px]", i >= filled && "bg-white/10")}
                    style={
                        i < filled
                            ? { background: `hsl(${(270 + (i / Math.max(1, ticks - 1)) * 220) % 360} 90% 62%)` }
                            : undefined
                    }
                />
            ))}
        </div>
    );
}

// Each quest wears one of the emoji.gg pack emotes (public/emoji, the same
// files the chat picker serves) so the list is not a column of bare text —
// owner, 2026-10-03. Keyed by quest id with an event-level fallback, so a new
// quest gets a picture before anyone names one for it.
const QUEST_ART: Record<string, string> = {
    daily_post: "/emoji/pepe/pepetyping.gif",
    weekly_posts: "/emoji/pepe/pepetyping.gif",
    daily_comments: "/emoji/sukuna-meme-aura/catnoted.png",
    daily_callout: "/emoji/penguin/agahi.gif",
    weekly_likes: "/emoji/pepe/pepeheart.png",
    weekly_followers: "/emoji/sukuna-meme-aura/hug.png",
    weekly_launch: "/emoji/chud-r-us/yippeee.png",
    daily_prediction: "/emoji/sukuna-meme-aura/catgoodjob.png",
    weekly_predictions: "/emoji/sukuna-meme-aura/catgoodjob.png",
    daily_perps: "/emoji/pepe/pepehacker.gif",
    weekly_perps: "/emoji/pepe/pepehacker.gif",
};
const QUEST_ART_FALLBACK = "/emoji/pepe/pepeclap.gif";
const QUEST_ART_DONE = "/emoji/pepe/pepeperfect.png";

interface QuestRow {
    id: string;
    title: string;
    target: number;
    xpReward: number;
    progress: number;
    completed: boolean;
}

function QuestCard({ q }: { q: QuestRow }) {
    return (
        <div className={cn("flex items-center gap-4 rounded-[20px] bg-panel px-5 py-4", q.completed && "opacity-70")}>
            {/* The emote tile. A finished quest swaps to the "perfect" pepe
                rather than greying the art out — done should read as a win. */}
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/[0.04]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={q.completed ? QUEST_ART_DONE : (QUEST_ART[q.id] ?? QUEST_ART_FALLBACK)}
                    alt=""
                    width={28}
                    height={28}
                    loading="lazy"
                    className="size-7 object-contain"
                />
            </div>
            <div className="flex flex-col gap-2 min-w-0">
                <span className={cn("text-sm font-bold", q.completed ? "text-zinc-400 line-through" : "text-white")}>{q.title}</span>
                <div className="flex items-center gap-2.5">
                    <TickProgress progress={q.progress} target={q.target} />
                    <span className="text-xs font-semibold text-zinc-500 tabular-nums">{Math.min(q.progress, q.target)}/{q.target}</span>
                </div>
            </div>
            <div className="ml-auto shrink-0">
                {q.completed ? (
                    <span className="flex items-center gap-1.5 rounded-full bg-lantern/10 px-3 py-1.5 text-xs font-bold text-lantern">
                        <Check className="size-3.5" /> +{q.xpReward} XP
                    </span>
                ) : (
                    <span className="rounded-full border border-flexborder/50 bg-black/25 px-3 py-1.5 text-xs font-bold text-zinc-300 tabular-nums">
                        +{q.xpReward} XP
                    </span>
                )}
            </div>
        </div>
    );
}

export function QuestsView() {
    const [tab, setTab] = React.useState<"daily" | "weekly">("daily");
    const { data, isLoading } = trpc.quest.list.useQuery(undefined, { refetchInterval: 60_000 });
    const prog = xpProgress(data?.xp ?? 0);

    const quests = tab === "daily" ? data?.daily : data?.weekly;
    const resetAt = data?.resetAt?.[tab];
    const completedCount = quests?.filter((q) => q.completed).length ?? 0;

    return (
        <div className="mx-auto w-full max-w-2xl px-4 pt-header pb-10 flex flex-col gap-4 text-zinc-100">
            <div className="flex items-end justify-between gap-3 flex-wrap">
                <div className="flex flex-col gap-1">
                    <h1 className="font-pixel text-2xl text-white">Quests</h1>
                    <p className="text-xs font-medium text-zinc-500">
                        Level {prog.level} — {prog.inLevel.toLocaleString()}/{prog.forNext.toLocaleString()} XP to next.
                        Complete quests to level up faster.
                    </p>
                </div>
                {resetAt && (
                    <span className="rounded-full border border-flexborder/50 bg-black/25 px-3 py-1.5 text-xs font-semibold text-zinc-400 tabular-nums">
                        Resets in {formatCountdown(new Date(resetAt))}
                    </span>
                )}
            </div>

            <div className="relative inline-flex rounded-full bg-[#16181c] p-1 text-sm font-semibold shadow-inner self-start">
                {(["daily", "weekly"] as const).map((t) => {
                    const active = tab === t;
                    return (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={cn(
                                "relative z-10 px-5 py-3 rounded-full capitalize text-xs sm:text-sm font-bold transition-colors duration-200 select-none cursor-pointer focus:outline-none min-w-[100px]",
                                active ? "text-black" : "text-zinc-400 hover:text-white",
                            )}
                        >
                            {t}
                            {active && (
                                <motion.div
                                    layoutId="quests-toggle-bg"
                                    className="absolute inset-0 bg-white rounded-full -z-10"
                                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                                />
                            )}
                        </button>
                    );
                })}
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={tab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15, ease: "easeInOut" }}
                    className="flex flex-col gap-2"
                >
                    {isLoading || !quests ? (
                        Array.from({ length: 3 }, (_, i) => <div key={i} className="shimmer-skeleton h-[76px] rounded-[20px]" />)
                    ) : (
                        <>
                            <p className="px-1 text-xs font-semibold text-zinc-500">
                                {completedCount}/{quests.length} completed
                            </p>
                            {quests.map((q) => <QuestCard key={q.id} q={q} />)}
                        </>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
