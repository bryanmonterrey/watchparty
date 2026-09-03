import { h, row, col, text } from "../h";
import { C } from "../tokens";
import { WIDE, innerWidth, frame, footer, avatar, chip, typeChip, verifiedMark, clamp, handle, fmtCompact, fitSize } from "../ui";
import type { Template } from "./types";

export const profile: Template = async ({ q, image }) => {
    const name = q.s("name", 80) || q.s("username", 80);
    const username = q.s("username", 80);
    const bio = clamp(q.s("bio", 400), 140);
    const verified = q.b("verified");
    const followers = q.n("followers");
    const following = q.n("following");
    const avatarSrc = await image(q.url("avatar"), 480);

    const chips = [];
    if (followers != null) chips.push(chip(`${fmtCompact(followers)} followers`));
    if (following != null) chips.push(chip(`${fmtCompact(following)} following`));

    return {
        size: WIDE,
        el: frame(WIDE, [
            row({ alignItems: "center", flexGrow: 1 }, [
                avatar(avatarSrc, 240, { marginRight: 56, border: `1px solid ${C.hair}` }),
                col({ width: innerWidth(WIDE) - 240 - 56, flexShrink: 0 }, [
                    typeChip("Profile"),
                    row({ alignItems: "center", marginTop: 26 }, [
                        text({ fontSize: fitSize(name.length, [[14, 72], [22, 60], [999, 48]]), fontWeight: 700, color: C.white, lineHeight: 1.05, letterSpacing: "-0.02em" }, clamp(name, 30)),
                        ...(verified ? [h("div", { marginLeft: 16, display: "flex" }, verifiedMark(48))] : []),
                    ]),
                    text({ fontSize: 32, fontWeight: 500, color: C.muted, marginTop: 8 }, handle(username)),
                    ...(bio ? [text({ fontSize: 30, fontWeight: 500, color: C.text, lineHeight: 1.35, marginTop: 24 }, bio)] : []),
                    ...(chips.length ? [row({ marginTop: 28, gap: 12 }, chips)] : []),
                ]),
            ]),
            footer(),
        ]),
    };
};
