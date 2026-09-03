import { h, row, col, text } from "../h";
import { C } from "../tokens";
import { WIDE, innerWidth, frame, footer, chip, typeChip, tile, clamp, fmtUsd, fmtPct, deltaColor, glowOf, fitSize } from "../ui";
import type { Template } from "./types";

// The pump.fun anatomy (docs/share-cards-plan.md §4b): name, ticker, "Market
// Cap" label, one huge glowing number, a "See more" pill, coin tile right.
// The glow colour follows the 24h move — lantern up, pastelred down, accent
// when flat/unknown. The same layout serves `market` and `live`'s numbers.
export const coin: Template = async ({ q, image }) => {
    const name = clamp(q.s("name", 80), 28);
    const symbol = q.s("symbol", 16).replace(/^\$/, "");
    const mcap = q.n("mcap");
    const price = q.n("price");
    const change = q.n("change");
    const chain = q.s("chain", 20);
    const progress = q.n("progress");
    const creator = q.s("creator", 80);
    const tileSrc = await image(q.url("image"), 640);

    const color = deltaColor(change);
    const headline = mcap != null ? fmtUsd(mcap) : price != null ? fmtUsd(price) : "—";
    const headlineLabel = mcap != null ? "Market Cap" : "Price";
    const headlineSize = fitSize(headline.length, [[6, 120], [8, 104], [999, 88]]);

    const chips = [];
    if (change != null) chips.push(chip(`${change >= 0 ? "↑" : "↓"} ${fmtPct(change)} 24h`, { fill: color, border: color, color: "#050505", size: 24, height: 52 }));
    if (price != null && mcap != null) chips.push(chip(fmtUsd(price), { size: 24, height: 52 }));
    if (progress != null && progress > 0 && progress < 100) chips.push(chip(`${Math.round(progress)}% to graduate`, { size: 24, height: 52 }));

    const TILE = 320;
    const leftW = innerWidth(WIDE) - TILE - 40;

    return {
        size: WIDE,
        el: frame(WIDE, [
            row({ flexGrow: 1, alignItems: "stretch" }, [
                col({ width: leftW, flexShrink: 0 }, [
                    row({ alignItems: "center", gap: 12 }, [typeChip("Coin", color), ...(chain ? [chip(chain, { size: 20, height: 40 })] : [])]),
                    text({ fontSize: 56, fontWeight: 600, color: C.white, lineHeight: 1.05, marginTop: 20, letterSpacing: "-0.02em" }, name || `$${symbol}`),
                    ...(symbol ? [text({ fontSize: 32, fontWeight: 500, color: C.muted, marginTop: 8 }, `$${symbol}`)] : []),
                    h("div", { flexGrow: 1, minHeight: 24 }),
                    text({ fontSize: 28, fontWeight: 500, color: C.muted }, headlineLabel),
                    text(
                        { fontSize: headlineSize, fontWeight: 700, color: C.white, lineHeight: 1, letterSpacing: "-0.03em", textShadow: `0 0 40px ${glowOf(color)}`, marginTop: 4 },
                        headline,
                    ),
                    row({ marginTop: 22, gap: 12, alignItems: "center" }, [
                        chip("See more", { fill: color, border: color, color: "#050505", size: 24, height: 56, weight: 600 }),
                        ...chips,
                    ]),
                ]),
                col({ width: TILE, marginLeft: 40, justifyContent: "center", flexShrink: 0 }, tile(tileSrc, TILE, TILE)),
            ]),
            h("div", { height: 20 }),
            footer(creator ? chip(`by @${creator.replace(/^@/, "")}`, { size: 20, height: 40 }) : null),
        ], { glow: glowOf(color) }),
    };
};
