import { SITE_URL } from "./metadata";

// Builds the URL of a generated share card. The renderer is og-worker/
// (docs/share-cards-plan.md §3): every field the card needs travels in the
// query string, so a card URL is immutable and the edge caches it hard.
//
// Field names here MUST match what og-worker/src/templates/<name>.ts reads.
// Caps are applied here first so the URL stays short; the worker caps again.

/** Bump together with TEMPLATE_VERSION in og-worker/src/index.ts. */
export const OG_TEMPLATE_VERSION = 1;

type Num = number | null | undefined;
type Str = string | null | undefined;

export interface PostCard {
    text: Str;
    name: Str;
    username: Str;
    avatar?: Str;
    verified?: boolean;
    likes?: Num;
    replies?: Num;
    reposts?: Num;
    /** Hero image (post media or video thumbnail). */
    image?: Str;
    video?: boolean;
    duration?: Str;
    ticker?: Str;
    mcap?: Num;
}
export interface ProfileCard {
    name: Str;
    username: Str;
    avatar?: Str;
    bio?: Str;
    verified?: boolean;
    followers?: Num;
    following?: Num;
}
export interface LiveCard {
    name: Str;
    username: Str;
    avatar?: Str;
    verified?: boolean;
    title: Str;
    category?: Str;
    viewers?: Num;
    thumb?: Str;
}
export interface CoinCard {
    name: Str;
    symbol: Str;
    image?: Str;
    price?: Num;
    mcap?: Num;
    /** 24h change, percent. */
    change?: Num;
    chain?: Str;
    /** Bonding-curve progress 0–100. */
    progress?: Num;
    creator?: Str;
}
export interface MarketCard {
    question: Str;
    image?: Str;
    outcomes: Array<{ label: string; pct: number }>;
    pool?: Num;
    /** Human label ("Sep 30", "in 3 days"). */
    closes?: Str;
    status?: "open" | "resolved" | "voided";
}
export interface CommunityCard {
    name: Str;
    icon?: Str;
    description?: Str;
    members?: Num;
    online?: Num;
    invite?: boolean;
}
export interface CategoryCard {
    title: Str;
    image?: Str;
    viewers?: Num;
}
export interface PnlCard {
    name: Str;
    symbol: Str;
    image?: Str;
    pnl: number;
    pct?: Num;
    username: Str;
    avatar?: Str;
    date?: Str;
    acquired?: Num;
    entry?: Num;
    mcap?: Num;
    /** Price series, any scale; the worker normalises. ≤ 128 points. */
    series?: number[];
    /** Indices into `series`. */
    buys?: number[];
    sells?: number[];
    realizedOnly?: boolean;
    ratio?: "portrait" | "wide";
}

export type CardFields = {
    post: PostCard;
    profile: ProfileCard;
    live: LiveCard;
    coin: CoinCard;
    market: MarketCard;
    community: CommunityCard;
    category: CategoryCard;
    pnl: PnlCard;
};
export type CardTemplate = keyof CardFields;

const CAP = 300;

function set(p: URLSearchParams, key: string, v: Str | Num | boolean | number[] | undefined) {
    if (v == null || v === "" || v === false) return;
    if (v === true) return p.set(key, "1");
    if (Array.isArray(v)) return v.length ? p.set(key, v.map((n) => round(n)).join(",")) : undefined;
    if (typeof v === "number") return Number.isFinite(v) ? p.set(key, String(round(v))) : undefined;
    p.set(key, absoluteIfRelative(String(v)).slice(0, CAP));
}
const round = (n: number) => (Math.abs(n) >= 1000 ? Math.round(n) : Number(n.toPrecision(6)));
const absoluteIfRelative = (s: string) => (s.startsWith("/") && !s.startsWith("//") ? `${SITE_URL}${s}` : s);

function params<T extends CardTemplate>(template: T, f: CardFields[T]): URLSearchParams {
    const p = new URLSearchParams();
    switch (template) {
        case "post": {
            const c = f as PostCard;
            set(p, "text", c.text?.slice(0, 260));
            set(p, "name", c.name); set(p, "username", c.username); set(p, "avatar", c.avatar); set(p, "verified", c.verified);
            set(p, "likes", c.likes); set(p, "replies", c.replies); set(p, "reposts", c.reposts);
            set(p, "image", c.image); set(p, "video", c.video); set(p, "duration", c.duration);
            set(p, "ticker", c.ticker); set(p, "mcap", c.mcap);
            break;
        }
        case "profile": {
            const c = f as ProfileCard;
            set(p, "name", c.name); set(p, "username", c.username); set(p, "avatar", c.avatar); set(p, "bio", c.bio?.slice(0, 200));
            set(p, "verified", c.verified); set(p, "followers", c.followers); set(p, "following", c.following);
            break;
        }
        case "live": {
            const c = f as LiveCard;
            set(p, "name", c.name); set(p, "username", c.username); set(p, "avatar", c.avatar); set(p, "verified", c.verified);
            set(p, "title", c.title); set(p, "category", c.category); set(p, "viewers", c.viewers); set(p, "thumb", c.thumb);
            break;
        }
        case "coin": {
            const c = f as CoinCard;
            set(p, "name", c.name); set(p, "symbol", c.symbol); set(p, "image", c.image); set(p, "price", c.price); set(p, "mcap", c.mcap);
            set(p, "change", c.change); set(p, "chain", c.chain); set(p, "progress", c.progress); set(p, "creator", c.creator);
            break;
        }
        case "market": {
            const c = f as MarketCard;
            set(p, "question", c.question); set(p, "image", c.image); set(p, "pool", c.pool); set(p, "closes", c.closes); set(p, "status", c.status);
            c.outcomes.slice(0, 3).forEach((o, i) => { set(p, `o${i + 1}`, o.label); set(p, `p${i + 1}`, o.pct); });
            break;
        }
        case "community": {
            const c = f as CommunityCard;
            set(p, "name", c.name); set(p, "icon", c.icon); set(p, "description", c.description?.slice(0, 200));
            set(p, "members", c.members); set(p, "online", c.online); set(p, "invite", c.invite);
            break;
        }
        case "category": {
            const c = f as CategoryCard;
            set(p, "title", c.title); set(p, "image", c.image); set(p, "viewers", c.viewers);
            break;
        }
        case "pnl": {
            const c = f as PnlCard;
            set(p, "name", c.name); set(p, "symbol", c.symbol); set(p, "image", c.image); set(p, "pnl", c.pnl); set(p, "pct", c.pct);
            set(p, "username", c.username); set(p, "avatar", c.avatar); set(p, "date", c.date);
            set(p, "acquired", c.acquired); set(p, "entry", c.entry); set(p, "mcap", c.mcap);
            set(p, "series", c.series?.slice(0, 128)); set(p, "buys", c.buys); set(p, "sells", c.sells);
            set(p, "realized", c.realizedOnly); set(p, "ratio", c.ratio);
            break;
        }
    }
    p.set("v", String(OG_TEMPLATE_VERSION));
    return p;
}

/** Site-relative card path — what the preview page and same-origin callers use. */
export function ogImagePath<T extends CardTemplate>(template: T, fields: CardFields[T]): string {
    return `/api/og/${template}?${params(template, fields).toString()}`;
}

/** Absolute card URL with the dimensions metadata wants. */
export function ogImage<T extends CardTemplate>(template: T, fields: CardFields[T]) {
    const portrait = template === "pnl" && (fields as PnlCard).ratio !== "wide";
    return {
        url: `${SITE_URL}${ogImagePath(template, fields)}`,
        width: portrait ? 1080 : 1200,
        height: portrait ? 1350 : 630,
        alt: "watchparty",
    };
}
