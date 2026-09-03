// Reads the share tags out of an HTML document the way a link crawler does:
// regex over the raw markup, no DOM. Shared by the /dev/share-cards preview
// page and scripts/dev/check-share-meta.mjs so the two cannot disagree about
// what "the card X will draw" is.

export interface ShareTags {
    title: string | null;
    description: string | null;
    image: string | null;
    imageAlt: string | null;
    url: string | null;
    siteName: string | null;
    card: string | null;
    type: string | null;
    canonical: string | null;
    /** The document <title>, which iMessage falls back to when og:title is absent. */
    docTitle: string | null;
}

const META_RE = /<meta\b[^>]*>/gi;
const ATTR_RE = /([a-zA-Z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function attrs(tag: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of tag.matchAll(ATTR_RE)) {
        out[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? m[5] ?? "");
    }
    return out;
}

function decode(s: string): string {
    return s
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
}

export function parseShareTags(html: string): ShareTags {
    const meta = new Map<string, string>();
    for (const m of html.matchAll(META_RE)) {
        const a = attrs(m[0]);
        const key = (a.property ?? a.name)?.toLowerCase();
        // First occurrence wins, like most crawlers.
        if (key && a.content !== undefined && !meta.has(key)) meta.set(key, a.content);
    }
    const pick = (...keys: string[]) => {
        for (const k of keys) {
            const v = meta.get(k);
            if (v) return v;
        }
        return null;
    };
    const canonical = /<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i.exec(html)?.[1]
        ?? /<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i.exec(html)?.[1]
        ?? null;
    const docTitle = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? null;

    return {
        title: pick("og:title", "twitter:title"),
        description: pick("og:description", "twitter:description", "description"),
        image: pick("og:image", "og:image:url", "twitter:image"),
        imageAlt: pick("og:image:alt", "twitter:image:alt"),
        url: pick("og:url"),
        siteName: pick("og:site_name"),
        card: pick("twitter:card"),
        type: pick("og:type"),
        canonical: canonical ? decode(canonical) : null,
        docTitle: docTitle ? decode(docTitle) : null,
    };
}

/** The user agents worth testing with; X's is the strict one. */
export const CRAWLER_UA = "Twitterbot/1.0";

/** Everything a card needs to draw at all. Returns the missing names. */
export function missingShareTags(tags: ShareTags): string[] {
    const missing: string[] = [];
    if (!tags.title) missing.push("og:title");
    if (!tags.image) missing.push("og:image");
    else if (!/^https?:\/\//.test(tags.image)) missing.push("og:image (must be absolute)");
    if (!tags.card) missing.push("twitter:card");
    if (!tags.description) missing.push("og:description");
    return missing;
}
