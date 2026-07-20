import * as React from "react";
import { cn } from "@/lib/utils";
import type { BadgeFamily, BadgeId } from "@/lib/badges";

// Badge glyphs from Microsoft Fluent Emoji (github.com/microsoft/fluentui-emoji,
// MIT), Flat style, vendored into public/badges/ — real emoji-grade art instead
// of hand-drawn shapes. Mapping: trophy = top caller, money bag = top trader,
// bullseye = sniper, crystal ball = prophet, chart = profitable, rocket =
// launcher, crown = premium, fire = streak, seedling = early member. Level
// tiers share the shield with the tier number composited on top (SVG text so
// it scales with the glyph).

/** Hover-glow tint per family (brand-tinted glow, never a gray shadow). */
export const FAMILY_GLOW: Record<BadgeFamily, string> = {
    caller: "rgba(255,204,0,0.55)",
    trading: "rgba(0,237,137,0.55)",
    social: "rgba(142,201,255,0.55)",
    premium: "rgba(255,116,108,0.55)",
};

const LEVEL_TIER: Partial<Record<BadgeId, number>> = {
    level_5: 5,
    level_10: 10,
    level_20: 20,
    level_50: 50,
};

export function BadgeGlyph({ id, className, style }: {
    id: BadgeId;
    className?: string;
    style?: React.CSSProperties;
}) {
    const tier = LEVEL_TIER[id];
    if (tier == null) {
        return (
            <img
                src={`/badges/${id}.svg`}
                alt=""
                aria-hidden
                draggable={false}
                className={cn("select-none", className)}
                style={style}
            />
        );
    }
    // Fluent assets are 32×32 — compose the tier number over the shield.
    return (
        <svg viewBox="0 0 32 32" aria-hidden className={cn("select-none", className)} style={style}>
            <image href="/badges/level.svg" width="32" height="32" />
            <text
                x="16"
                y="16.5"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={tier >= 10 ? 12 : 14}
                fontWeight="800"
                fill="#fff"
            >
                {tier}
            </text>
        </svg>
    );
}
