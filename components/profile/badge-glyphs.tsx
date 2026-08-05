import * as React from "react";
import { cn } from "@/lib/utils";
import type { BadgeFamily, BadgeId } from "@/lib/badges";
import { RibbonWhiteBadge } from "@/components/badges";

// Badge glyphs from Microsoft Fluent Emoji (github.com/microsoft/fluentui-emoji,
// MIT), Flat style, vendored into public/badges/ — then redrawn as pixel art by
// scripts/build-pixel-badges.mjs and served from public/badges/pixel/.
//
// The smooth originals read as "an emoji someone dropped in" beside font-pixel;
// the pixel versions belong to the same face. They're still SVG (squares, not a
// raster), so the 14px chat glyph and the 32px profile one are both exact. Mapping: trophy = top caller, money bag = top trader,
// bullseye = sniper, crystal ball = prophet, chart = profitable, rocket =
// launcher, fire = streak. Level tiers share the shield with the tier number
// composited on top (SVG text so it scales with the glyph). Early member is
// the one purchased asset in the set — components/badges.tsx — since it's
// the rarest/most coveted badge and earns the nicer art.

/** Hover-glow tint per family (brand-tinted glow, never a gray shadow). */
export const FAMILY_GLOW: Record<BadgeFamily, string> = {
    caller: "rgba(255,204,0,0.55)",
    trading: "rgba(0,237,137,0.55)",
    social: "rgba(142,201,255,0.55)",
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
    if (id === "early_member") {
        return <RibbonWhiteBadge aria-hidden className={cn("select-none", className)} style={style} />;
    }

    const tier = LEVEL_TIER[id];
    if (tier == null) {
        return (
            <img
                src={`/badges/pixel/${id}.svg`}
                alt=""
                aria-hidden
                draggable={false}
                className={cn("select-none", className)}
                style={style}
            />
        );
    }
    // The pixel shield is a 16-unit grid — compose the tier number over it, in
    // the pixel face so the number doesn't reintroduce smooth type on top of
    // pixel art.
    return (
        <svg viewBox="0 0 16 16" aria-hidden className={cn("select-none", className)} style={style}>
            <image href="/badges/pixel/level.svg" width="16" height="16" />
            <text
                x="8"
                y="8.5"
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={tier >= 10 ? 6 : 7.5}
                className="font-pixel"
                fill="#fff"
            >
                {tier}
            </text>
        </svg>
    );
}
