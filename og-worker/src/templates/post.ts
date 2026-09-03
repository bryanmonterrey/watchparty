import { h, row, col, text, img } from "../h";
import { C, R } from "../tokens";
import { WIDE, innerWidth, frame, footer, identity, chip, typeChip, clamp, fitSize, fmtCompact, fmtUsd, playGlyph, star } from "../ui";
import type { Template } from "./types";

// Post card. Four variants from one layout:
//   text          — author strip, the text large, stat chips
//   image / video — the media as a hero on the right, text left, play glyph
//   token         — a $TICKER chip with the market cap
// Old callers (the composer's token-launch snapshot) send only
// text/name/username/avatar and get the text variant.
export const post: Template = async ({ q, image }) => {
    const body = clamp(q.s("text", 400), 220);
    const name = q.s("name", 80) || "Creator";
    const username = q.s("username", 80) || "creator";
    const verified = q.b("verified");
    const likes = q.n("likes");
    const replies = q.n("replies");
    const reposts = q.n("reposts");
    const ticker = q.s("ticker", 16);
    const mcap = q.n("mcap");
    const isVideo = q.b("video");
    const duration = q.s("duration", 12);

    const [avatarSrc, heroSrc] = await Promise.all([
        image(q.url("avatar"), 240),
        image(q.url("image"), 1000),
    ]);

    const hasHero = Boolean(heroSrc);
    const textSize = hasHero
        ? fitSize(body.length, [[60, 40], [120, 34], [999, 30]])
        : fitSize(body.length, [[60, 56], [120, 46], [180, 40], [999, 36]]);

    const stats: ReturnType<typeof chip>[] = [];
    if (likes != null) stats.push(chip(`${fmtCompact(likes)} likes`));
    if (replies != null) stats.push(chip(`${fmtCompact(replies)} replies`));
    if (reposts != null) stats.push(chip(`${fmtCompact(reposts)} reposts`));
    if (ticker) {
        stats.push(
            chip(mcap != null ? `$${ticker} · ${fmtUsd(mcap)} mcap` : `$${ticker}`, {
                fill: "rgba(0,237,137,0.12)",
                border: "rgba(0,237,137,0.35)",
                color: C.up,
                leading: h("div", { marginRight: 10, display: "flex" }, star(18)),
            }),
        );
    }

    const HERO = 470;
    const leftW = hasHero ? innerWidth(WIDE) - HERO - 40 : innerWidth(WIDE);
    const left = col({ width: leftW, flexShrink: 0, marginRight: hasHero ? 40 : 0 }, [
        row({ alignItems: "center", justifyContent: "space-between" }, [
            identity(name, username, { verified, nameSize: 34, avatarSrc, avatarSize: 84 }),
            typeChip(isVideo ? "Video" : ticker ? "Launch" : "Post"),
        ]),
        text(
            { fontSize: textSize, fontWeight: 500, color: C.white, lineHeight: 1.3, marginTop: 36, letterSpacing: "-0.01em" },
            body || "…",
        ),
        row({ marginTop: "auto", paddingTop: 28, gap: 12, flexWrap: "wrap" }, stats),
    ]);

    const hero = hasHero
        ? col(
              { width: HERO, height: HERO, borderRadius: R.hero, overflow: "hidden", position: "relative", flexShrink: 0, border: `1px solid ${C.hair}` },
              [
                  img(heroSrc!, { width: HERO, height: HERO, objectFit: "cover" }),
                  ...(isVideo
                      ? [
                            col({ position: "absolute", left: 0, top: 0, width: HERO, height: HERO, alignItems: "center", justifyContent: "center" }, playGlyph(110)),
                            ...(duration ? [h("div", { position: "absolute", right: 16, bottom: 16, display: "flex" }, chip(duration, { fill: "rgba(0,0,0,0.65)", size: 20, height: 40 }))] : []),
                        ]
                      : []),
              ],
          )
        : null;

    return {
        size: WIDE,
        el: frame(WIDE, [
            row({ flexGrow: 1, alignItems: "stretch" }, hero ? [left, hero] : [left]),
            h("div", { height: 24 }),
            footer(),
        ]),
    };
};
