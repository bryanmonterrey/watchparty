import { ogImagePath, type CardTemplate, type CardFields } from "./og-url";

// Sample data for every generated card, so /dev/share-cards can show the
// whole family before (and independent of) the pages that will build them
// from real rows. Keep one fixture per variant that has its own layout.

export interface CardFixture {
    label: string;
    template: CardTemplate;
    path: string;
    portrait?: boolean;
}

function fx<T extends CardTemplate>(label: string, template: T, fields: CardFields[T], portrait = false): CardFixture {
    return { label, template, path: ogImagePath(template, fields), portrait };
}

const series = [10, 12, 11, 13, 12, 14, 13, 15, 14, 13, 15, 16, 15, 17, 16, 18, 17, 19, 18, 20, 19, 22, 21, 24, 60, 45, 40, 42, 41, 44, 50, 55, 58, 62, 70, 68, 75, 80, 85, 90];

export const CARD_FIXTURES: CardFixture[] = [
    fx("Coin · up", "coin", { name: "watchparty", symbol: "WATCH", mcap: 9780, price: 0.00000978, change: 42.5, chain: "Solana", progress: 37, creator: "bry" }),
    fx("Coin · down", "coin", { name: "pibble", symbol: "PIBBLE", mcap: 2_890_000, price: 0.00289, change: -12.3, chain: "Solana" }),
    fx("PnL · portrait", "pnl", { name: "pibble", symbol: "PIBBLE", pnl: 33410, pct: 6407, username: "bry", date: "29 Sep 25", acquired: 521.5, entry: 36110, mcap: 2_890_000, series, buys: [3], sells: [25, 26, 27, 34, 35] }, true),
    fx("PnL · wide (unfurl)", "pnl", { ratio: "wide", name: "pibble", symbol: "PIBBLE", pnl: -1240, pct: -38.2, username: "bry", date: "29 Sep 25", acquired: 3240, entry: 36110, mcap: 2_890_000, series: [50, 48, 47, 45, 46, 44, 40, 38, 36, 35, 33, 30, 31, 29, 28, 27, 26, 25], buys: [0, 2], sells: [15] }),
    fx("Post · text", "post", { text: "gm chat. we just hit 10k holders on $WATCH and the stream is live right now 🔥", name: "bry", username: "bryanmonterreyx", verified: true, likes: 1240, replies: 88, reposts: 45 }),
    fx("Post · launch", "post", { text: "launching $PIBBLE live on stream tonight", name: "bry", username: "bry", ticker: "PIBBLE", mcap: 2_890_000, likes: 12 }),
    fx("Post · image", "post", { text: "new thumbnail for tonight's stream", name: "bry", username: "bry", verified: true, image: "/icon-512.png", likes: 302, replies: 14 }),
    fx("Post · video", "post", { text: "clip of the launch", name: "bry", username: "bry", image: "/icon-512.png", video: true, duration: "0:42", likes: 980 }),
    fx("Profile", "profile", { name: "bry", username: "bryanmonterreyx", verified: true, bio: "building watchparty. magic internet money meets streaming.", followers: 12400, following: 310 }),
    fx("Live", "live", { name: "bry", username: "bry", verified: true, title: "launching a coin live + trading it on stream", category: "Just Chatting", viewers: 1532, thumb: "/icon-512.png" }),
    fx("Market", "market", { question: "Will $WATCH hit $1M market cap before October?", outcomes: [{ label: "Yes", pct: 64 }, { label: "No", pct: 36 }], pool: 12500, closes: "Sep 30" }),
    fx("Community", "community", { name: "watchparty degens", description: "the official server for launches, streams and alpha", members: 4210, online: 312 }),
    fx("Community · invite", "community", { name: "watchparty degens", description: "the official server", members: 4210, invite: true }),
    fx("Category", "category", { title: "Just Chatting", image: "/thumbnails/just-chatting.webp", viewers: 25400 }),
];
