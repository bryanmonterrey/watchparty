// Real crypto news for the "What's happening" card — headlines from the
// outlets' own RSS feeds, not price lines (owner, 2026-10-03: "I don't want
// it to just talk about prices. I want it to talk about actual news").
//
// RSS because it is free, keyless and fast (every feed below answered in
// ~0.1–0.2 s when this was written), and because the alternatives all need a
// key or a bill: CryptoPanic (token), CoinGecko news (Pro), the X API
// (pay-per-use). Parsed with regexes rather than an XML library — there is no
// DOMParser on workerd and the shape is five tags per <item>.
//
// Every fetch has a deadline and failures are per-feed: one outlet down costs
// its headlines, not the card. Only when EVERY feed fails does the caller fall
// back to the market movers.

export type NewsHeadline = {
    title: string;
    url: string;
    source: string;
    publishedAt: number; // epoch ms
};

const FEEDS: { source: string; url: string }[] = [
    { source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
    { source: "Cointelegraph", url: "https://cointelegraph.com/rss" },
    { source: "The Block", url: "https://www.theblock.co/rss.xml" },
    { source: "Decrypt", url: "https://decrypt.co/feed" },
    { source: "The Defiant", url: "https://thedefiant.io/api/feed" },
];

const FEED_TIMEOUT_MS = 4000;
/** No outlet gets more than this many of the slots — the card is a digest, not one feed. */
const PER_SOURCE_CAP = 2;
/** Older than this is not "happening". */
const MAX_AGE_MS = 36 * 3600 * 1000;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(s: string): string {
    return s
        .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
        .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

/** The text of the first <tag> in `xml`, CDATA unwrapped, entities decoded, trimmed. */
function tag(xml: string, name: string): string | null {
    const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
    if (!m) return null;
    const inner = m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
    return decodeEntities(inner.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim() || null;
}

function parseFeed(xml: string, source: string): NewsHeadline[] {
    const out: NewsHeadline[] = [];
    for (const m of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
        const item = m[1];
        const title = tag(item, "title");
        // <link> first; some feeds leave it empty and carry the URL in <guid>.
        const link = tag(item, "link") ?? tag(item, "guid");
        const when = Date.parse(tag(item, "pubDate") ?? tag(item, "dc:date") ?? "");
        if (!title || !link || !/^https?:\/\//.test(link) || !Number.isFinite(when)) continue;
        // Tracking params are the feed's, not ours.
        let url = link;
        try {
            const u = new URL(link);
            for (const k of [...u.searchParams.keys()]) if (k.startsWith("utm_")) u.searchParams.delete(k);
            url = u.toString();
        } catch { /* keep as-is */ }
        out.push({ title, url, source, publishedAt: when });
    }
    return out;
}

async function fetchFeed(feed: { source: string; url: string }): Promise<NewsHeadline[]> {
    const res = await fetch(feed.url, {
        headers: { "user-agent": "watchparty-news/1.0 (+https://watchparty.xyz)", accept: "application/rss+xml, application/xml, text/xml" },
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
        redirect: "follow",
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), feed.source);
}

/** Near-duplicate key: same story syndicated under slightly different casing/punctuation. */
const normTitle = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);

/**
 * The freshest `count` headlines across all feeds, newest first, at most
 * PER_SOURCE_CAP per outlet, de-duplicated. Empty only if every feed failed.
 */
export async function fetchCryptoNews(count: number): Promise<NewsHeadline[]> {
    const settled = await Promise.allSettled(FEEDS.map(fetchFeed));
    const cutoff = Date.now() - MAX_AGE_MS;
    const all = settled
        .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
        .filter((h) => h.publishedAt >= cutoff && h.publishedAt <= Date.now() + 60_000)
        .sort((a, b) => b.publishedAt - a.publishedAt);

    const seen = new Set<string>();
    const perSource = new Map<string, number>();
    const picked: NewsHeadline[] = [];
    for (const h of all) {
        const k = normTitle(h.title);
        if (seen.has(k)) continue;
        if ((perSource.get(h.source) ?? 0) >= PER_SOURCE_CAP) continue;
        seen.add(k);
        perSource.set(h.source, (perSource.get(h.source) ?? 0) + 1);
        picked.push(h);
        if (picked.length >= count) break;
    }
    return picked;
}

/** "2h ago" / "35m ago" / "just now" — the card's meta line. */
export function timeAgo(epochMs: number, now = Date.now()): string {
    const mins = Math.max(0, Math.round((now - epochMs) / 60_000));
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.round(hours / 24)}d ago`;
}
