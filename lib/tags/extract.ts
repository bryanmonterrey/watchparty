/**
 * Pull coin Tags out of post text.
 *
 * A Tag is a ticker written in a post — `$CASHCAT`. Every piece of content here
 * is a post, so this one extractor covers the whole product surface rather than
 * each composer growing its own.
 *
 * ## Why extraction and not a picker
 *
 * The reference's markers appear because somebody WROTE about the coin, not
 * because they filled in a field. Requiring a picker would mean almost no Tags;
 * reading them out of what people already type means the chart fills itself.
 *
 * ## Deliberately strict, because the cost of a false positive is a wrong chart
 *
 * A Tag puts an avatar on a coin's chart at a price and a moment. A stray match
 * mis-attributes somebody's words to a coin they never mentioned, so:
 *
 *  - `$` must start a word (`\B\$` would match `US$5`);
 *  - 2-16 chars, letters/digits, must START with a letter — `$1`, `$100`, `$5m`
 *    are money, not tickers, and money is far more common in this app's text;
 *  - a bare `$` or `$$` is nothing;
 *  - case is preserved for display but the KEY is lowercase, since `$cashcat`
 *    and `$CASHCAT` are one coin;
 *  - the same ticker twice in a post is ONE tag. A post is a tag or it isn't;
 *    repetition is emphasis, not two mentions.
 *
 * Resolution from ticker to a specific coin does NOT happen here — that needs
 * the database, symbols collide across chains, and this file stays pure so it
 * can be unit-tested without one.
 */

/** `$` at a word boundary, then a letter, then up to 15 more letters/digits. */
const TAG_RE = /(?<![\w$])\$([A-Za-z][A-Za-z0-9]{1,15})\b/g;

export interface ExtractedTag {
    /** As written, for display: `CashCat`. */
    raw: string;
    /** Lowercased, for lookup and dedupe: `cashcat`. */
    key: string;
}

/** Every distinct ticker mentioned in a post, in the order they appear. */
export function extractTags(text: string | null | undefined): ExtractedTag[] {
    if (!text) return [];
    const seen = new Set<string>();
    const out: ExtractedTag[] = [];
    for (const m of text.matchAll(TAG_RE)) {
        const raw = m[1];
        const key = raw.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ raw, key });
    }
    return out;
}

/** Does this post tag this ticker? Symbols arrive with or without the `$`. */
export function postTagsTicker(text: string | null | undefined, symbol: string): boolean {
    const want = symbol.replace(/^\$/, "").toLowerCase();
    if (!want) return false;
    return extractTags(text).some((t) => t.key === want);
}
