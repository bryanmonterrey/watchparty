import { h, row, col, text, img } from "../h";
import { C, R } from "../tokens";
import { WIDE, innerWidth, frame, footer, identity, chip, typeChip, clamp, fmtCompact, fitSize, tile } from "../ui";
import type { Template } from "./types";

// A profile while its host is broadcasting: the stream is the card.
export const live: Template = async ({ q, image }) => {
    const name = q.s("name", 80);
    const username = q.s("username", 80);
    const title = clamp(q.s("title", 200), 80);
    const category = q.s("category", 60);
    const viewers = q.n("viewers");
    const verified = q.b("verified");
    const [avatarSrc, thumbSrc] = await Promise.all([image(q.url("avatar"), 240), image(q.url("thumb"), 1100)]);

    const livePill = chip("LIVE", { fill: C.down, border: C.down, color: "#ffffff", size: 22, height: 44, dot: "#ffffff" });

    const HERO_W = 480;
    const HERO_H = 300;
    const leftW = innerWidth(WIDE) - HERO_W - 44;
    const hero = col(
        { width: HERO_W, height: HERO_H, borderRadius: R.hero, overflow: "hidden", position: "relative", flexShrink: 0, border: `1px solid ${C.hair}` },
        [
            thumbSrc ? img(thumbSrc, { width: HERO_W, height: HERO_H, objectFit: "cover" }) : tile(null, HERO_W, HERO_H, R.hero, { border: "none" }),
            h("div", { position: "absolute", left: 16, top: 16, display: "flex" }, livePill),
            ...(viewers != null
                ? [h("div", { position: "absolute", right: 16, top: 16, display: "flex" }, chip(`${fmtCompact(viewers)} watching`, { fill: "rgba(0,0,0,0.65)", size: 20, height: 40 }))]
                : []),
        ],
    );

    return {
        size: WIDE,
        el: frame(WIDE, [
            row({ flexGrow: 1, alignItems: "center" }, [
                col({ width: leftW, flexShrink: 0, marginRight: 44 }, [
                    row({ alignItems: "center", gap: 12 }, [typeChip("Live", C.down), ...(category ? [chip(category)] : [])]),
                    text({ fontSize: fitSize(title.length, [[40, 52], [60, 44], [999, 38]]), fontWeight: 600, color: C.white, lineHeight: 1.15, marginTop: 28, letterSpacing: "-0.01em" }, title || `${name} is live`),
                    h("div", { marginTop: 32, display: "flex" }, identity(name, username, { verified, nameSize: 30, avatarSrc, avatarSize: 72 })),
                ]),
                hero,
            ]),
            footer(),
        ]),
    };
};
