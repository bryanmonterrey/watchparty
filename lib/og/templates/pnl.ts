import { h, row, col, text, svg, path, circle, type El } from "../h";
import { C } from "../tokens";
import { WIDE, PORTRAIT, innerWidth, frame, footer, chip, avatar, tile, stat, clamp, fmtUsd, fmtPct, deltaColor, glowOf, fitSize, type Size } from "../ui";
import type { Template } from "./types";

// The brag card (docs/share-cards-plan.md §9). Portrait for posting as media,
// wide for the /pnl/[id] unfurl — one template, `ratio` switches the layout.
//
// series: comma-separated values (any scale; normalised here), buys/sells:
// indices into it. Everything arrives in the URL from the persisted snapshot.
export const pnl: Template = async ({ q, image }) => {
    const portrait = q.s("ratio", 10) !== "wide";
    const size: Size = portrait ? PORTRAIT : WIDE;

    const name = clamp(q.s("name", 80), 24);
    const symbol = q.s("symbol", 16).replace(/^\$/, "");
    const pnlUsd = q.n("pnl") ?? 0;
    const pct = q.n("pct");
    const username = q.s("username", 80) || "anon";
    const date = q.s("date", 24);
    const acquired = q.n("acquired");
    const entry = q.n("entry");
    const mcap = q.n("mcap");
    const series = q.nums("series", 256);
    const buys = q.nums("buys", 64);
    const sells = q.nums("sells", 64);
    const realizedOnly = q.b("realized");

    const [coinSrc, avatarSrc] = await Promise.all([image(q.url("image"), 240), image(q.url("avatar"), 160)]);

    const color = deltaColor(pnlUsd);
    const headline = fmtUsd(pnlUsd, { sign: true });

    const pad = portrait ? 56 : 48;
    const inner = innerWidth(size, pad);
    const chartW = portrait ? inner : 500;
    const chartH = portrait ? 440 : 300;
    const leftW = inner - chartW - 36;

    const tileSize = portrait ? 96 : 72;
    const coinStrip = row({ alignItems: "center" }, [
        tile(coinSrc, tileSize, tileSize, portrait ? 28 : 20, { marginRight: portrait ? 22 : 16 }),
        col({}, [
            text({ fontSize: portrait ? 44 : 36, fontWeight: 700, color: C.white, lineHeight: 1.05 }, name || `$${symbol}`),
            text({ fontSize: portrait ? 28 : 24, fontWeight: 500, color: C.muted, marginTop: 4 }, `$${symbol}`),
        ]),
    ]);

    const numbers = col({ width: portrait ? inner : leftW }, [
        row({ alignItems: "center", flexWrap: "wrap", gap: 12 }, [
            text({ fontSize: fitSize(headline.length, portrait ? [[7, 128], [9, 108], [999, 88]] : [[7, 88], [9, 76], [999, 64]]), fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.03em", textShadow: `0 0 40px ${glowOf(color)}` }, headline),
            ...(pct != null
                ? [h("div", { marginLeft: 18, display: "flex" }, chip(`${pct >= 0 ? "↑" : "↓"} ${fmtPct(pct)}`, { fill: color, border: color, color: "#050505", size: portrait ? 40 : 28, height: portrait ? 76 : 56, weight: 700 }))]
                : []),
        ]),
        row({ alignItems: "center", marginTop: portrait ? 26 : 18 }, [
            avatar(avatarSrc, portrait ? 64 : 52, { marginRight: 16 }),
            col({}, [
                text({ fontSize: portrait ? 32 : 26, fontWeight: 600, color: C.white, lineHeight: 1.1 }, `${username.replace(/^@/, "")}'s position`),
                ...(date ? [text({ fontSize: portrait ? 24 : 20, fontWeight: 500, color: C.muted, marginTop: 4 }, date)] : []),
            ]),
            ...(realizedOnly ? [h("div", { marginLeft: 16, display: "flex" }, chip("Realized", { size: 20, height: 40 }))] : []),
        ]),
    ]);

    const stats = row({ width: portrait ? inner : leftW, justifyContent: "space-between", alignItems: "flex-end", marginTop: portrait ? 44 : 28 }, [
        ...(acquired != null ? [stat("Acquired", fmtUsd(acquired), { size: portrait ? 44 : 34 })] : []),
        ...(entry != null ? [stat("Average entry", fmtUsd(entry), { size: portrait ? 44 : 34 })] : []),
        ...(mcap != null ? [stat("Market Cap", fmtUsd(mcap), { size: portrait ? 44 : 34, align: "flex-end" })] : []),
    ]);

    const chart = priceChart(series, buys, sells, chartW, chartH, color);

    const body = portrait
        ? [coinStrip, h("div", { marginTop: 40, display: "flex" }, chart), h("div", { marginTop: 44, display: "flex" }, numbers), stats, h("div", { flexGrow: 1 })]
        : [
              row({ flexGrow: 1, alignItems: "stretch" }, [
                  col({ width: leftW, flexShrink: 0, marginRight: 36 }, [coinStrip, h("div", { marginTop: 22, display: "flex" }, numbers), stats]),
                  col({ width: chartW, justifyContent: "center", flexShrink: 0 }, chart),
              ]),
          ];

    return {
        size,
        el: frame(size, [...body, h("div", { height: portrait ? 36 : 20 }), footer(chip(`Trade $${symbol}`, { fill: color, border: color, color: "#050505", size: 22, height: 48 }))], {
            glow: glowOf(color),
            padding: pad,
        }),
    };
};

/** Line chart as inline SVG + absolutely positioned marker chips (svg text would need fonts resvg doesn't have). */
function priceChart(series: number[], buys: number[], sells: number[], w: number, hgt: number, color: string): El {
    const pts = series.length >= 2 ? series : [0, 1];
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const padY = 28;
    const x = (i: number) => (i / (pts.length - 1)) * w;
    const y = (v: number) => padY + (1 - (v - min) / span) * (hgt - padY * 2);
    const d = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");

    const idx = (i: number) => Math.max(0, Math.min(pts.length - 1, Math.round(i)));
    const dots: El[] = [];
    const chips: El[] = [];
    const place = (i: number, label: string, fill: string, textColor: string) => {
        const cx = x(idx(i));
        const cy = y(pts[idx(i)]);
        dots.push(circle({ cx: cx.toFixed(1), cy: cy.toFixed(1), r: 9, fill, stroke: C.panel, strokeWidth: 3 }));
        const chipW = 40 + label.length * 14;
        const left = Math.max(0, Math.min(w - chipW, cx - chipW / 2));
        const top = cy < hgt / 2 ? cy + 18 : cy - 18 - 36;
        chips.push(h("div", { position: "absolute", left, top, display: "flex" }, chip(label, { fill, border: fill, color: textColor, size: 20, height: 36, weight: 700 })));
    };
    // Group sells that land within ~2% of the width of each other.
    const group = (list: number[]) => {
        const groups: Array<{ i: number; n: number }> = [];
        for (const s of [...list].sort((a, b) => a - b)) {
            const last = groups[groups.length - 1];
            if (last && x(idx(s)) - x(idx(last.i)) < w * 0.08) last.n += 1;
            else groups.push({ i: s, n: 1 });
        }
        return groups.slice(0, 8);
    };
    for (const g of group(buys)) place(g.i, g.n > 1 ? `B +${g.n}` : "B", C.up, "#050505");
    for (const g of group(sells)) place(g.i, g.n > 1 ? `S +${g.n}` : "S", C.down, "#050505");

    return col({ width: w, height: hgt, position: "relative" }, [
        svg({ width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}` }, [
            path({ d, fill: "none", stroke: color, strokeWidth: 14, strokeOpacity: 0.18, strokeLinejoin: "round", strokeLinecap: "round" }),
            path({ d, fill: "none", stroke: color, strokeWidth: 4, strokeLinejoin: "round", strokeLinecap: "round" }),
            ...dots,
        ]),
        ...chips,
    ]);
}
