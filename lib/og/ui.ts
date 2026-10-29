// Card primitives. Every template is built from these so the cards read as one
// family: same frame, same chips, same wordmark, same number styling.
// Rules: docs/design-principles.md — no gradients, no gray/black drop shadows;
// depth is a hairline + 1px inset highlight + a BRAND-tinted glow only.

import { h, row, col, text, img, svg, path, type El, type Style } from "./h";
import { C, FONT, PIXEL, R } from "./tokens";

export const WIDE = { width: 1200, height: 630 } as const;
export const PORTRAIT = { width: 1080, height: 1350 } as const;
export type Size = { width: number; height: number };

// satori (yoga) lets a flex column GROW to its text's intrinsic width instead
// of wrapping it, so a two-column layout with `flexGrow: 1` on the text side
// pushes the other column off the canvas. Every column therefore gets an
// explicit width, derived from the frame's inner width.
export const FRAME_PAD = 32;
export const PANEL_PAD = 48;
export const innerWidth = (size: Size, padding = PANEL_PAD) => size.width - FRAME_PAD * 2 - padding * 2 - 2;

// public/pinkstarlogo.svg, verbatim.
const STAR_PATH =
    "M324.642 11.001C355.155 -13.7306 400.907 5.69008 404.312 44.8189L414.088 157.151C415.397 172.193 423.568 185.792 436.235 194.01L530.828 255.378C563.779 276.754 559.447 326.268 523.285 341.598L419.472 385.608C405.57 391.501 395.162 403.475 391.261 418.061L362.127 526.989C351.979 564.932 303.55 576.113 277.796 546.459L203.86 461.326C193.959 449.926 179.356 443.727 164.277 444.524L51.6782 450.477C12.4563 452.551 -13.1427 409.947 7.10175 376.29L65.2201 279.665C73.0027 266.726 74.3854 250.922 68.9679 236.828L28.5111 131.579C14.4187 94.9178 47.0271 57.4062 85.2931 66.2592L195.148 91.6744C209.859 95.0778 225.317 91.509 237.047 82.0013L324.642 11.001Z";

export const star = (size: number, fill: string = C.star) =>
    svg({ width: size, height: size * (564 / 554), viewBox: "0 0 554 564" }, [path({ d: STAR_PATH, fill })]);

/** Full-bleed canvas + the rounded panel everything sits in. */
export function frame(size: Size, children: El[], opts: { glow?: string; padding?: number } = {}): El {
    const glow = opts.glow ? `, 0 0 90px ${opts.glow}` : "";
    return col(
        { width: size.width, height: size.height, backgroundColor: C.canvas, padding: 32, fontFamily: FONT, color: C.text },
        col(
            {
                flexGrow: 1,
                backgroundColor: C.panel,
                borderRadius: R.panel,
                border: `1px solid ${C.hair}`,
                boxShadow: `inset 0 1px 0 ${C.highlight}${glow}`,
                padding: opts.padding ?? PANEL_PAD,
                position: "relative",
            },
            children,
        ),
    );
}

/** Circular avatar; a flat disc when there is no image (never initials). */
export function avatar(src: string | null, size: number, style: Style = {}): El {
    const base: Style = { width: size, height: size, borderRadius: size / 2, flexShrink: 0, ...style };
    return src
        ? img(src, { ...base, objectFit: "cover" })
        : h("div", { ...base, backgroundColor: C.fill, border: `1px solid ${C.hair}` });
}

/** Rounded-square tile for coins, communities, box art. */
export function tile(src: string | null, w: number, hgt: number, radius: number = R.tile, style: Style = {}): El {
    const base: Style = { width: w, height: hgt, borderRadius: radius, flexShrink: 0, border: `1px solid ${C.hair}`, ...style };
    return src
        ? img(src, { ...base, objectFit: "cover" })
        : col({ ...base, backgroundColor: C.raised, alignItems: "center", justifyContent: "center" }, star(Math.round(w * 0.42)));
}

export interface ChipOpts {
    fill?: string;
    color?: string;
    border?: string;
    size?: number; // font size
    height?: number;
    weight?: number;
    dot?: string; // leading dot colour
    leading?: El; // custom leading element
}

/** Pill chip. 44px tall by default; the "See more" CTA passes height 64. */
export function chip(label: string, o: ChipOpts = {}): El {
    const height = o.height ?? 44;
    const kids: El[] = [];
    if (o.dot) kids.push(h("div", { width: 10, height: 10, borderRadius: 5, backgroundColor: o.dot, marginRight: 10 }));
    if (o.leading) kids.push(o.leading);
    kids.push(text({ fontSize: o.size ?? 22, fontWeight: o.weight ?? 600, color: o.color ?? C.text, lineHeight: 1 }, label));
    return row(
        {
            height,
            paddingLeft: Math.round(height * 0.45),
            paddingRight: Math.round(height * 0.45),
            borderRadius: R.chip,
            alignItems: "center",
            backgroundColor: o.fill ?? C.fill,
            border: `1px solid ${o.border ?? C.hair}`,
            flexShrink: 0,
            alignSelf: "flex-start",
        },
        kids,
    );
}

/** The small "what is this" chip at the top of a card. */
export const typeChip = (kind: string, dot: string = C.accent) => chip(kind, { dot, size: 20, height: 40 });

/** Label over value. */
export function stat(label: string, value: string, o: { size?: number; color?: string; align?: "flex-start" | "flex-end" } = {}): El {
    return col({ alignItems: o.align ?? "flex-start", flexShrink: 0 }, [
        text({ fontSize: 24, fontWeight: 500, color: C.muted, lineHeight: 1.2 }, label),
        text({ fontSize: o.size ?? 40, fontWeight: 600, color: o.color ?? C.white, lineHeight: 1.15, marginTop: 6 }, value),
    ]);
}

/** Verified mark — a badge, not an entitlement (see CLAUDE.md). */
export const verifiedMark = (size = 30) =>
    svg({ width: size, height: size, viewBox: "0 0 24 24" }, [
        path({ d: "M12 1.5l2.6 2.1 3.3-.4 1 3.2 3 1.5-1 3.2 1.6 2.9-2.6 2.1-.4 3.3-3.3.4-1.5 3-3.2-1-2.9 1.6-2.1-2.6-3.3-.4.4-3.3-3-1.5 1-3.2L1.5 12l2.6-2.1.4-3.3 3.3.4 1.5-3 3.2 1L12 1.5z", fill: C.accent }),
        path({ d: "M9.2 12.4l1.9 1.9 4.2-4.4", stroke: "#ffffff", strokeWidth: 2.2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" }),
    ]);

/** name + verified, over @handle. */
export function identity(name: string, username: string, o: { verified?: boolean; nameSize?: number; handleSize?: number; avatarSrc?: string | null; avatarSize?: number } = {}): El {
    const nameSize = o.nameSize ?? 36;
    const kids: El[] = [];
    if (o.avatarSize) kids.push(avatar(o.avatarSrc ?? null, o.avatarSize, { marginRight: Math.round(o.avatarSize * 0.25) }));
    kids.push(
        col({ minWidth: 0 }, [
            row({ alignItems: "center" }, [
                text({ fontSize: nameSize, fontWeight: 600, color: C.white, lineHeight: 1.1 }, clamp(name, 40)),
                ...(o.verified ? [h("div", { marginLeft: Math.round(nameSize * 0.25), display: "flex" }, verifiedMark(Math.round(nameSize * 0.85)))] : []),
            ]),
            text({ fontSize: o.handleSize ?? Math.round(nameSize * 0.72), fontWeight: 500, color: C.muted, lineHeight: 1.2, marginTop: 4 }, handle(username)),
        ]),
    );
    return row({ alignItems: "center" }, kids);
}

/** Wordmark: star + "watchparty" in the pixel font. */
export function wordmark(size = 30): El {
    return row({ alignItems: "center" }, [
        star(Math.round(size * 0.95)),
        text({ fontFamily: PIXEL, fontSize: size, color: C.white, marginLeft: Math.round(size * 0.4), lineHeight: 1 }, "watchparty"),
    ]);
}

/** Bottom strip of every card: wordmark left, optional element right. */
export function footer(right?: El | null): El {
    return row({ alignItems: "center", justifyContent: "space-between", marginTop: "auto" }, [wordmark(), right ?? h("div", {})]);
}

/** Play glyph overlay for video heroes. */
export const playGlyph = (size = 96) =>
    col(
        { width: size, height: size, borderRadius: size / 2, backgroundColor: "rgba(0,0,0,0.6)", border: `2px solid rgba(255,255,255,0.35)`, alignItems: "center", justifyContent: "center" },
        svg({ width: size * 0.42, height: size * 0.42, viewBox: "0 0 24 24" }, [path({ d: "M8 5.5v13l11-6.5z", fill: "#ffffff" })]),
    );

// ---------- text + number helpers ----------

export function clamp(s: string, max: number): string {
    const flat = s.replace(/\s+/g, " ").trim();
    return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

export const handle = (u: string) => (u.startsWith("@") ? u : `@${u}`);

/** Body-copy size that shrinks as the text grows. */
export function fitSize(len: number, steps: Array<[number, number]>): number {
    for (const [upTo, size] of steps) if (len <= upTo) return size;
    return steps[steps.length - 1][1];
}

export function fmtCompact(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${trim(abs / 1e9)}B`;
    if (abs >= 1e6) return `${trim(abs / 1e6)}M`;
    if (abs >= 1e3) return `${trim(abs / 1e3)}K`;
    return abs < 10 && !Number.isInteger(abs) ? abs.toFixed(2) : String(Math.round(abs));
}
const trim = (v: number) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.0+$|(\.\d*?)0+$/, "$1");

/** $9.78K, $2.89M; tiny prices keep their significant digits. */
export function fmtUsd(n: number, o: { sign?: boolean } = {}): string {
    const sign = n < 0 ? "-" : o.sign ? "+" : "";
    const abs = Math.abs(n);
    if (abs >= 1000) return `${sign}$${fmtCompact(abs)}`;
    if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
    if (abs === 0) return "$0";
    // 0.0000123 → keep 3 significant digits
    const digits = Math.min(10, Math.max(2, -Math.floor(Math.log10(abs)) + 2));
    return `${sign}$${abs.toFixed(digits)}`;
}

export function fmtPct(n: number, o: { sign?: boolean } = {}): string {
    const sign = n < 0 ? "-" : o.sign ? "+" : "";
    const abs = Math.abs(n);
    const s = abs >= 100 || Number.isInteger(abs) ? abs.toFixed(0) : abs.toFixed(abs >= 10 ? 1 : 2);
    return `${sign}${s.replace(/\.0+$|(\.\d*?)0+$/, "$1")}%`;
}

export const deltaColor = (n: number | null | undefined) => (n == null || n === 0 ? C.accent : n > 0 ? C.up : C.down);
export const glowOf = (color: string) => color === C.up ? "rgba(0,237,137,0.16)" : color === C.down ? "rgba(255,116,108,0.16)" : "rgba(53,142,252,0.16)";
