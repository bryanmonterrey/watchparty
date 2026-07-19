import * as React from "react";
import type { BadgeFamily, BadgeId } from "@/lib/badges";

// Flat illustrated glyphs for the earned-badge strip (owner decision
// 2026-07-19: illustrated/flat, not pixel-art). Solid fills only — no
// gradients, no strokes that vanish at 20px. Accent families per the brief:
// sunset = caller, lantern = trading, pastels = social, pastelred = premium.

const SUNSET = "#FFCC00";
const SUNSET_DEEP = "#E8A200";
const LANTERN = "#00ED89";
const LANTERN_DEEP = "#00B368";
const PASTEL_BLUE = "#8EC9FF";
const PASTEL_BLUE_DEEP = "#5FA8E8";
const PASTEL_PINK = "#FFB3C7";
const PASTEL_PINK_DEEP = "#F98BAB";
const PASTEL_VIOLET = "#C6B6FF";
const PASTEL_VIOLET_DEEP = "#A18BF5";
const PREMIUM_RED = "#FF746C";
const PREMIUM_RED_DEEP = "#E5544C";

/** Hover-glow tint per family (brand-tinted glow, never a gray shadow). */
export const FAMILY_GLOW: Record<BadgeFamily, string> = {
    caller: "rgba(255,204,0,0.55)",
    trading: "rgba(0,237,137,0.55)",
    social: "rgba(142,201,255,0.55)",
    premium: "rgba(255,116,108,0.55)",
};

type GlyphProps = React.SVGProps<SVGSVGElement>;

const base = (props: GlyphProps): GlyphProps => ({
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true,
    ...props,
});

/** Weekly Top Caller finish — sunset trophy. */
function TopCallerGlyph(props: GlyphProps) {
    return (
        <svg {...base(props)}>
            <path d="M6 4h12v6a6 6 0 0 1-12 0V4Z" fill={SUNSET} />
            <path d="M4 5h2v4a3 3 0 0 1-3-3 1 1 0 0 1 1-1Zm16 0h-2v4a3 3 0 0 0 3-3 1 1 0 0 0-1-1Z" fill={SUNSET_DEEP} />
            <rect x="10.5" y="15" width="3" height="3.5" fill={SUNSET_DEEP} />
            <rect x="7.5" y="18" width="9" height="2.8" rx="1.4" fill={SUNSET} />
            <path d="M12 6.2l.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 8.3l2-.3.9-1.8Z" fill="#FFF6D6" />
        </svg>
    );
}

/** Weekly Top Trader finish — lantern trophy with a candle tick. */
function TopTraderGlyph(props: GlyphProps) {
    return (
        <svg {...base(props)}>
            <path d="M6 4h12v6a6 6 0 0 1-12 0V4Z" fill={LANTERN} />
            <path d="M4 5h2v4a3 3 0 0 1-3-3 1 1 0 0 1 1-1Zm16 0h-2v4a3 3 0 0 0 3-3 1 1 0 0 0-1-1Z" fill={LANTERN_DEEP} />
            <rect x="10.5" y="15" width="3" height="3.5" fill={LANTERN_DEEP} />
            <rect x="7.5" y="18" width="9" height="2.8" rx="1.4" fill={LANTERN} />
            <path d="M9 10.2l2-2.4 1.6 1.4 2.4-3 1 .8-3.3 4.1-1.6-1.4-1.3 1.6L9 10.2Z" fill="#053B26" />
        </svg>
    );
}

/** Callout hit 10× — sunset crosshair locked on. */
function SniperGlyph(props: GlyphProps) {
    return (
        <svg {...base(props)}>
            <circle cx="12" cy="12" r="8" fill={SUNSET} />
            <circle cx="12" cy="12" r="5" fill="#3A2E00" />
            <circle cx="12" cy="12" r="2.2" fill={SUNSET} />
            <rect x="11" y="1" width="2" height="4.4" rx="1" fill={SUNSET_DEEP} />
            <rect x="11" y="18.6" width="2" height="4.4" rx="1" fill={SUNSET_DEEP} />
            <rect x="1" y="11" width="4.4" height="2" rx="1" fill={SUNSET_DEEP} />
            <rect x="18.6" y="11" width="4.4" height="2" rx="1" fill={SUNSET_DEEP} />
        </svg>
    );
}

/** Won a prediction — pastel crystal ball. */
function ProphetGlyph(props: GlyphProps) {
    return (
        <svg {...base(props)}>
            <circle cx="12" cy="10.5" r="7.5" fill={PASTEL_VIOLET} />
            <path d="M8.2 6.6a4.8 4.8 0 0 1 3-1.6c.6-.05.8.7.3 1a5 5 0 0 0-2.2 2.2c-.3.5-1.05.3-1.05-.3 0-.45 0-.9-.05-1.3Z" fill="#EFE9FF" />
            <path d="M7 19.4c0-1 .8-1.9 1.9-1.9h6.2c1.1 0 1.9.9 1.9 1.9v.8c0 .5-.4.8-.9.8H7.9c-.5 0-.9-.3-.9-.8v-.8Z" fill={PASTEL_VIOLET_DEEP} />
        </svg>
    );
}

/** Positive 30d PnL, shared — lantern coin with an up arrow. */
function ProfitableGlyph(props: GlyphProps) {
    return (
        <svg {...base(props)}>
            <circle cx="12" cy="12" r="9" fill={LANTERN} />
            <circle cx="12" cy="12" r="6.4" fill={LANTERN_DEEP} />
            <path d="M12 7.6l3.4 3.6h-2.1v4.4a1.3 1.3 0 0 1-2.6 0v-4.4H8.6L12 7.6Z" fill="#EAFFF5" />
        </svg>
    );
}

/** Launched a live token — lantern rocket. */
function LauncherGlyph(props: GlyphProps) {
    return (
        <svg {...base(props)}>
            <path d="M12 2.5c2.8 1.6 4.5 4.6 4.5 8.1 0 2-.5 3.8-1.4 5.4h-6.2A11 11 0 0 1 7.5 10.6c0-3.5 1.7-6.5 4.5-8.1Z" fill={LANTERN} />
            <circle cx="12" cy="9.5" r="2.1" fill="#053B26" />
            <path d="M8.9 16h6.2l1.7 3a.7.7 0 0 1-.6 1H7.8a.7.7 0 0 1-.6-1l1.7-3Z" fill={LANTERN_DEEP} />
            <path d="M10.6 20.5h2.8c0 1.2-.6 2.3-1.4 3-.8-.7-1.4-1.8-1.4-3Z" fill={SUNSET} />
        </svg>
    );
}

/** Premium member — pastelred crown. */
function PremiumGlyph(props: GlyphProps) {
    return (
        <svg {...base(props)}>
            <path d="M4 7.5l4.2 3.3L12 5l3.8 5.8L20 7.5l-1.5 9H5.5L4 7.5Z" fill={PREMIUM_RED} />
            <rect x="5.5" y="17.5" width="13" height="2.6" rx="1.3" fill={PREMIUM_RED_DEEP} />
            <circle cx="12" cy="12.4" r="1.7" fill="#FFE9E7" />
        </svg>
    );
}

/** Level tier — pastel-blue shield with the tier number. */
function LevelGlyph({ tier, ...props }: GlyphProps & { tier: 5 | 10 | 20 | 50 }) {
    return (
        <svg {...base(props)}>
            <path d="M12 2l8 3v6.5c0 4.7-3.2 8.6-8 10.5-4.8-1.9-8-5.8-8-10.5V5l8-3Z" fill={PASTEL_BLUE} />
            <path d="M12 4.2l6 2.25V11.4c0 3.6-2.4 6.7-6 8.3V4.2Z" fill={PASTEL_BLUE_DEEP} />
            <text x="12" y="14.6" textAnchor="middle" fontSize="7.5" fontWeight="800" fill="#0B3358" fontFamily="inherit">{tier}</text>
        </svg>
    );
}

/** 7-day quest streak — pastel-pink flame. */
function StreakGlyph(props: GlyphProps) {
    return (
        <svg {...base(props)}>
            <path d="M12 2.5c3.5 3 7 6.6 7 11a7 7 0 0 1-14 0c0-2 .8-3.9 2-5.4.3 1 .9 1.9 1.8 2.5C8.6 7.4 10 4.6 12 2.5Z" fill={PASTEL_PINK} />
            <path d="M12 10c1.8 1.6 3.2 3.3 3.2 5.3a3.2 3.2 0 0 1-6.4 0c0-2 1.4-3.7 3.2-5.3Z" fill={PASTEL_PINK_DEEP} />
        </svg>
    );
}

/** First 1,000 accounts — pastel sprout in soil. */
function EarlyGlyph(props: GlyphProps) {
    return (
        <svg {...base(props)}>
            <path d="M12 13c0-3.9 2.9-7 6.8-7 .4 0 .7.3.7.7 0 3.9-3.1 6.8-7 6.8H12Z" fill={PASTEL_BLUE} />
            <path d="M12 13c0-3.1-2.3-5.6-5.4-5.6-.4 0-.6.3-.6.6C6 11.1 8.5 13.4 11.6 13.4l.4-.4Z" fill={PASTEL_BLUE_DEEP} />
            <rect x="11.1" y="11.5" width="1.8" height="7" rx="0.9" fill={PASTEL_BLUE_DEEP} />
            <path d="M6.5 18.4c0-.6.5-1 1-1h9a1 1 0 0 1 1 1v1.2c0 .5-.4.9-1 .9h-9c-.6 0-1-.4-1-.9v-1.2Z" fill={PASTEL_PINK} />
        </svg>
    );
}

const GLYPHS: Record<BadgeId, (props: GlyphProps) => React.ReactElement> = {
    top_caller: TopCallerGlyph,
    top_trader: TopTraderGlyph,
    callout_sniper: SniperGlyph,
    prophet: ProphetGlyph,
    profitable: ProfitableGlyph,
    token_launcher: LauncherGlyph,
    premium: PremiumGlyph,
    level_5: (p) => <LevelGlyph tier={5} {...p} />,
    level_10: (p) => <LevelGlyph tier={10} {...p} />,
    level_20: (p) => <LevelGlyph tier={20} {...p} />,
    level_50: (p) => <LevelGlyph tier={50} {...p} />,
    quest_streak: StreakGlyph,
    early_member: EarlyGlyph,
};

export function BadgeGlyph({ id, ...props }: GlyphProps & { id: BadgeId }) {
    const Glyph = GLYPHS[id];
    return <Glyph {...props} />;
}
