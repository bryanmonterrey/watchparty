import { h, row, col, text } from "../h";
import { C } from "../tokens";
import { WIDE, innerWidth, frame, footer, chip, typeChip, tile, clamp, fmtUsd, fmtPct, fitSize, glowOf } from "../ui";
import type { Template } from "./types";

// Prediction market: the coin layout with the leading outcome's implied %
// as the big number and the outcomes as bars underneath.
export const market: Template = async ({ q, image }) => {
    const question = clamp(q.s("question", 300), 110);
    const pool = q.n("pool");
    const closes = q.s("closes", 40);
    const status = q.s("status", 20);
    const outcomes: Array<{ label: string; pct: number }> = [];
    for (let i = 1; i <= 3; i++) {
        const label = q.s(`o${i}`, 40);
        const pct = q.n(`p${i}`);
        if (label && pct != null) outcomes.push({ label, pct: Math.max(0, Math.min(100, pct)) });
    }
    const imageSrc = await image(q.url("image"), 640);
    const lead = outcomes[0];
    const resolved = status === "resolved";
    const color = resolved ? C.accent : C.up;

    const bars = outcomes.map((o, i) =>
        col({ marginTop: i === 0 ? 0 : 14 }, [
            row({ justifyContent: "space-between", alignItems: "center" }, [
                text({ fontSize: 26, fontWeight: 600, color: i === 0 ? C.white : C.text }, clamp(o.label, 32)),
                text({ fontSize: 26, fontWeight: 600, color: i === 0 ? color : C.muted }, fmtPct(o.pct)),
            ]),
            h("div", { marginTop: 8, height: 14, width: "100%", borderRadius: 7, backgroundColor: C.fill, display: "flex" },
                h("div", { height: 14, width: `${Math.max(2, o.pct)}%`, borderRadius: 7, backgroundColor: i === 0 ? color : "rgba(255,255,255,0.22)" })),
        ]),
    );

    const chips = [];
    if (pool != null) chips.push(chip(`${fmtUsd(pool)} pool`, { size: 22, height: 48 }));
    if (resolved) chips.push(chip("Resolved", { fill: C.accent, border: C.accent, color: "#fff", size: 22, height: 48 }));
    else if (closes) chips.push(chip(`Closes ${closes}`, { size: 22, height: 48 }));

    const RIGHT = 380;
    const leftW = innerWidth(WIDE) - RIGHT - 48;

    return {
        size: WIDE,
        el: frame(WIDE, [
            row({ flexGrow: 1, alignItems: "stretch" }, [
                col({ width: leftW, flexShrink: 0 }, [
                    typeChip("Market", color),
                    text({ fontSize: fitSize(question.length, [[50, 46], [80, 40], [999, 34]]), fontWeight: 600, color: C.white, lineHeight: 1.2, marginTop: 24, letterSpacing: "-0.01em" }, question || "Prediction market"),
                    ...(lead
                        ? [
                              h("div", { flexGrow: 1, minHeight: 16 }),
                              row({ alignItems: "flex-end" }, [
                                  text({ fontSize: 112, fontWeight: 700, color: C.white, lineHeight: 1, letterSpacing: "-0.03em", textShadow: `0 0 40px ${glowOf(color)}` }, fmtPct(lead.pct)),
                                  text({ fontSize: 28, fontWeight: 500, color: C.muted, marginLeft: 18, marginBottom: 14 }, clamp(lead.label, 24)),
                              ]),
                          ]
                        : []),
                    row({ marginTop: 24, gap: 12 }, chips),
                ]),
                col({ width: RIGHT, marginLeft: 48, justifyContent: "center", flexShrink: 0 }, [
                    ...(imageSrc ? [h("div", { display: "flex", marginBottom: 24, justifyContent: "flex-end" }, tile(imageSrc, 160, 160, 32))] : []),
                    ...bars,
                ]),
            ]),
            h("div", { height: 24 }),
            footer(),
        ], { glow: glowOf(color) }),
    };
};
