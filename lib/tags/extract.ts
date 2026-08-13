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
 *  - 2-16 chars of letters/digits, and it must CONTAIN A LETTER. Requiring it
 *    to START with one was wrong and threw away real tickers — `$4CHAN` is a
 *    coin. What actually separates a ticker from money is the letter;
 *  - money SHORTHAND is still excluded: `$5m`, `$10k`, `$2b` contain a letter
 *    and are not tickers. Digits followed by a lone k/m/b/t is a number.
 *    ⚠️ A hypothetical `$2B` ticker collides with "$2 billion" and loses. That
 *    is the right way round: money is written constantly here, and a wrong tag
 *    puts somebody's words on a coin they never mentioned;
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

/** `$` opening a word, then 2-16 letters/digits. Letter/money rules below. */
const TAG_RE = /(?<![\w$])\$([A-Za-z0-9]{2,16})\b/g;

/** Digits, optionally decimal, optionally one magnitude suffix: `5m`, `10k`,
 *  `1.5b`. Written far more often than any ticker shaped like it. */
const MONEY_RE = /^\d+(?:\.\d+)?[kmbt]?$/i;

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
        // A ticker has a letter in it somewhere; `$100` does not.
        if (!/[A-Za-z]/.test(raw)) continue;
        if (MONEY_RE.test(raw)) continue;
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
