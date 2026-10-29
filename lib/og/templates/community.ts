import { row, col, text } from "../h";
import { C } from "../tokens";
import { WIDE, innerWidth, frame, footer, chip, typeChip, tile, clamp, fmtCompact, fitSize } from "../ui";
import type { Template } from "./types";

export const community: Template = async ({ q, image }) => {
    const name = clamp(q.s("name", 100), 40);
    const description = clamp(q.s("description", 400), 130);
    const members = q.n("members");
    const online = q.n("online");
    const invite = q.b("invite");
    const iconSrc = await image(q.url("icon"), 480);

    const chips = [];
    if (members != null) chips.push(chip(`${fmtCompact(members)} members`));
    if (online != null) chips.push(chip(`${fmtCompact(online)} online`, { dot: C.up }));

    return {
        size: WIDE,
        el: frame(WIDE, [
            row({ alignItems: "center", flexGrow: 1 }, [
                tile(iconSrc, 240, 240, 56, { marginRight: 56 }),
                col({ width: innerWidth(WIDE) - 240 - 56, flexShrink: 0 }, [
                    typeChip(invite ? "Invite" : "Community"),
                    ...(invite ? [text({ fontSize: 28, fontWeight: 500, color: C.accent, marginTop: 24 }, "You're invited to")] : []),
                    text({ fontSize: fitSize(name.length, [[14, 72], [24, 58], [999, 46]]), fontWeight: 700, color: C.white, lineHeight: 1.05, marginTop: invite ? 8 : 24, letterSpacing: "-0.02em" }, name || "Community"),
                    ...(description ? [text({ fontSize: 30, fontWeight: 500, color: C.text, lineHeight: 1.35, marginTop: 20 }, description)] : []),
                    ...(chips.length ? [row({ marginTop: 28, gap: 12 }, chips)] : []),
                ]),
            ]),
            footer(),
        ]),
    };
};
