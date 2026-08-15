// Renders `:code:` from the emoji.gg packs as an inline image, leaving every
// other character alone.
//
// Deliberately NOT lib/chat/emotes.ts's parseChatText: that one also tokenises
// @mentions and links, and post bodies don't currently linkify. Reusing it here
// would quietly change how every post renders as a side effect of adding
// emoji. This does one job.
//
// An unknown code falls through as the literal text the author typed, so a
// removed pack degrades to `:pepeclap:` rather than vanishing mid-sentence.

import { PACK_EMOJI_BY_CODE } from "@/lib/emoji/packs.generated";

const CODE = /:([a-z0-9_+-]+):/gi;

export function EmoteText({ text, size = 22 }: { text: string; size?: number }) {
    if (!text.includes(":")) return <>{text}</>;

    const out: React.ReactNode[] = [];
    let last = 0;
    let key = 0;

    for (const m of text.matchAll(CODE)) {
        const hit = PACK_EMOJI_BY_CODE.get(m[1].toLowerCase());
        if (!hit) continue;
        const at = m.index;
        if (at > last) out.push(text.slice(last, at));
        out.push(
            <img
                key={key++}
                src={hit.src}
                alt={`:${hit.code}:`}
                title={`:${hit.code}:`}
                width={size}
                height={size}
                loading="lazy"
                decoding="async"
                // align-text-bottom rather than a vertical-align tweak: these
                // sit inside running text at several font sizes, and the
                // baseline is the only anchor that holds across all of them.
                className="inline-block align-text-bottom object-contain"
                style={{ width: size, height: size }}
            />,
        );
        last = at + m[0].length;
    }

    if (!out.length) return <>{text}</>;
    if (last < text.length) out.push(text.slice(last));
    return <>{out}</>;
}
