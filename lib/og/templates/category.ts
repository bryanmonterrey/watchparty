import { row, col, text } from "../h";
import { C } from "../tokens";
import { WIDE, innerWidth, frame, footer, typeChip, tile, clamp, fitSize, chip, fmtCompact } from "../ui";
import type { Template } from "./types";

export const category: Template = async ({ q, image }) => {
    const title = clamp(q.s("title", 100), 40);
    const viewers = q.n("viewers");
    const art = await image(q.url("image"), 480);
    return {
        size: WIDE,
        el: frame(WIDE, [
            row({ alignItems: "center", flexGrow: 1 }, [
                tile(art, 240, 320, 28, { marginRight: 56 }),
                col({ width: innerWidth(WIDE) - 240 - 56, flexShrink: 0 }, [
                    typeChip("Category"),
                    text({ fontSize: fitSize(title.length, [[14, 76], [24, 60], [999, 48]]), fontWeight: 700, color: C.white, lineHeight: 1.05, marginTop: 24, letterSpacing: "-0.02em" }, title || "Category"),
                    text({ fontSize: 30, fontWeight: 500, color: C.muted, marginTop: 16 }, "Streams and coins on watchparty"),
                    ...(viewers != null ? [row({ marginTop: 28 }, chip(`${fmtCompact(viewers)} watching`, { dot: C.down }))] : []),
                ]),
            ]),
            footer(),
        ]),
    };
};
