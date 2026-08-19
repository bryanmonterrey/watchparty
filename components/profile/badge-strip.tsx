"use client";

import * as React from "react";
import { BADGE_BY_ID, BADGE_STRIP_MAX, type EarnedBadge } from "@/lib/badges";
import { BadgeGlyph, FAMILY_GLOW } from "./badge-glyphs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// The earned-badge strip (docs/design-brief-2026-07.md §1): up to
// BADGE_STRIP_MAX flat glyphs inline after the username, "+N" collapses the
// rest into a full-list dialog. Hover = brand-tinted glow (never a gray
// shadow) + tooltip with name, description and earned date.

const SIZES = { sm: "size-4", md: "size-[22px]", lg: "size-7" } as const;

function earnedLine(b: EarnedBadge): string | null {
    const date = b.earnedAt
        ? new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(new Date(b.earnedAt))
        : null;
    if (b.detail && date) return `${b.detail} · ${date}`;
    return b.detail ?? (date ? `Earned ${date}` : null);
}

export function BadgeStrip({ badges, size = "md", className }: {
    badges: EarnedBadge[];
    size?: keyof typeof SIZES;
    className?: string;
}) {
    const [showAll, setShowAll] = React.useState(false);
    if (!badges.length) return null;

    const visible = badges.slice(0, BADGE_STRIP_MAX);
    const overflow = badges.length - visible.length;

    return (
        <TooltipProvider>
            <div className={cn("flex items-center gap-1.5", className)}>
                {visible.map((b) => {
                    const def = BADGE_BY_ID[b.id];
                    const sub = earnedLine(b);
                    return (
                        <Tooltip key={b.id} delayDuration={160}>
                            <TooltipTrigger asChild>
                                <button
                                    type="button"
                                    onClick={() => setShowAll(true)}
                                    aria-label={def.name}
                                    className="group/badge cursor-pointer transition-transform duration-150 hover:scale-110 active:scale-95"
                                >
                                    <BadgeGlyph
                                        id={b.id}
                                        className={cn(SIZES[size], "transition-[filter] duration-150 group-hover/badge:[filter:drop-shadow(0_0_5px_var(--badge-glow))]")}
                                        style={{ "--badge-glow": FAMILY_GLOW[def.family] } as React.CSSProperties}
                                    />
                                </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="border-white/10 bg-[#101011] text-white">
                                <p className="font-bold">{def.name}</p>
                                <p className="text-xs text-zinc-400">{def.description}</p>
                                {sub && <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">{sub}</p>}
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
                {overflow > 0 && (
                    <button
                        type="button"
                        onClick={() => setShowAll(true)}
                        className="flex h-[22px] cursor-pointer items-center rounded-full bg-white/10 px-1.5 text-[11px] font-bold text-zinc-300 transition-colors hover:bg-white/15"
                    >
                        +{overflow}
                    </button>
                )}
            </div>

            <Dialog open={showAll} onOpenChange={setShowAll}>
                <DialogContent className="max-w-sm rounded-[20px] p-5">
                    <DialogTitle className="font-pixel text-lg text-white">Badges</DialogTitle>
                    <div className="mt-1 flex flex-col gap-1">
                        {badges.map((b) => {
                            const def = BADGE_BY_ID[b.id];
                            const sub = earnedLine(b);
                            return (
                                <div key={b.id} className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-white/5">
                                    <BadgeGlyph id={b.id} className="size-8 shrink-0" />
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-white">{def.name}</p>
                                        <p className="truncate text-xs text-zinc-400">{def.description}</p>
                                        {sub && <p className="text-[11px] font-semibold text-zinc-500">{sub}</p>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    );
}
