/**
 * Mobula OHLCV adapter — a REMOVABLE trial of a paid market-data provider.
 *
 * See docs/market-data-options.md for why this exists. Short version: every
 * chart read went to GeckoTerminal from Cloudflare's shared egress IP, and GT
 * limits per IP — measured at ~6 calls/min, so production charts were blank on
 * every chain.
 *
 * ── HOW TO REMOVE ────────────────────────────────────────────────────────────
 * Delete `MOBULA_API_KEY` from the environment. That's it. With the variable
 * unset every function here reports disabled, the caller skips this path
 * entirely, and behaviour is byte-for-byte what it was before. No code change,
 * no redeploy needed. Deleting this file plus its one call site in
 * lib/tokens/udf-datafeed removes it permanently.
 *
 * ── HOW TO TRIAL IT ──────────────────────────────────────────────────────────
 *   MOBULA_API_KEY=demo    → demo-api.mobula.io, NO key needed, no billing.
 *   MOBULA_API_KEY=<key>   → api.mobula.io with the key.
 *
 * The demo endpoint is real data (verified against Solana, Base and Ethereum)
 * and is the honest way to evaluate this before paying for anything. Mobula
 * labels it for testing only, so it should not carry production traffic.
 *
 * ── WHY THIS IS BETTER THAN THE GT PATH ──────────────────────────────────────
 * Mobula keys OHLCV by TOKEN ADDRESS, not by pool. The GT path first had to
 * discover a pool, and that lookup was itself the thing failing in production —
 * `resolvePool` returned null and the reader gave up before touching candles we
 * already had. This adapter has no such dependency, so it works for a coin we
 * have never seen on a chain we have never indexed.
 *
 * ── COST ─────────────────────────────────────────────────────────────────────
 * A GET to ohlcv-history costs 5 CREDITS, not 1 (their docs, under Rate Limit).
 * On the $50/mo Start-up plan's 125k credits that is 25,000 chart fetches a
 * month, ~830/day. Fine for fetch-on-open, nowhere near enough to poll.
 *
 * So liveness does NOT come from re-fetching this endpoint. It comes from the
 * trades feed the coin page is already paying for: those rows carry a pool and
 * an execution price, and `lib/coins/record-mobula-trades` projects them into
 * `coin_candles`, which the chart subscribes to over Realtime. History is a
 * fetch; the moving bar is a database write.
 */

import type { Candle } from "@/lib/coins/candle-resolution";

const DEMO_BASE = "https://demo-api.mobula.io/api";
const LIVE_BASE = "https://api.mobula.io/api";

/** Max candles per request, per their docs. */
const MAX_CANDLES = 2000;

const rawKey = () => process.env.MOBULA_API_KEY?.trim() || "";
const isDemo = () => rawKey().toLowerCase() === "demo";

/** The whole feature flag. Unset ⇒ this module does nothing. */
export const mobulaEnabled = () => !!rawKey();

/**
 * Upstream cadence per plan — how often the tRPC caches let a coin cost a
 * fresh Mobula call. The FREE key has 10k credits/month, which a 5s trades
 * window would burn in days (12/min per watched coin); these defaults keep a
 * continuously-watched coin near ~2.9k calls/day worst case, and real usage
 * far below it. Set MOBULA_PLAN=startup after upgrading to the $50 tier
 * (125k credits) and every board tightens without a code change.
 */
export function mobulaCadence() {
    const free = (process.env.MOBULA_PLAN ?? "free").trim().toLowerCase() === "free";
    return free
        ? { tradesTtl: 30, chainFeedTtl: 300, securityTtl: 900 }
        : { tradesTtl: 5, chainFeedTtl: 90, securityTtl: 120 };
}

/**
 * TradingView resolution → Mobula `period`.
 *
 * Returns null for anything without an exact match rather than guessing: a
 * silently-wrong period produces a chart that looks plausible and is lying,
 * which is worse than falling through to the existing GT path.
 */
function mobulaPeriod(resolution: string): string | null {
    switch (resolution) {
        case "1":
            return "1m";
        case "5":
            return "5m";
        case "15":
            return "15m";
        case "60":
            return "1h";
        case "240":
            return "4h";
        case "720":
            return "12h";
        case "1D":
        case "D":
            return "1d";
        default:
            return null;
    }
}

/**
 * Our network slugs → Mobula `chainId`.
 *
 * Mobula accepts chain names ("solana", "base", "ethereum"). Our slugs already
 * match for the chains we list, so this is identity with an explicit allowlist
 * rather than a passthrough — an unknown chain should fall through to GT, not
 * become a malformed request that burns credits to 400.
 */
const CHAIN_IDS: Record<string, string> = {
    solana: "solana",
    ethereum: "ethereum",
    eth: "ethereum",
    base: "base",
    arbitrum: "arbitrum",
    optimism: "optimism",
    polygon: "polygon",
    bsc: "bsc",
    avalanche: "avalanche",
};

export function mobulaChainId(network: string): string | null {
    return CHAIN_IDS[network.toLowerCase()] ?? null;
}

type MobulaCandle = { t: number; o: number; h: number; l: number; c: number; v: number };

// ── Chain-wide pair feed (the /trade DexScreener-style board) ────────────────
//
// GET /api/1/market/blockchain/pairs is pair-level and per-chain: every DEX
// pair on the chain with 5m/1h/24h price+volume windows, trade counts, holder
// counts, liquidity and (for launchpad pairs) bonding state. Default order is
// newest-created first; sortBy=volume_24h gives the trending board. Verified
// against the demo host on solana/ethereum/base/polygon/bsc/hyperevm.

/** /trade's chain ids → the `blockchain` param the pairs endpoint accepts.
 *  Separate from CHAIN_IDS above: bnb is "bsc" here, and chains the pairs
 *  endpoint 500s on (bitcoin, robinhood) are simply absent. */
const PAIR_BLOCKCHAINS: Record<string, string> = {
    solana: "solana",
    ethereum: "ethereum",
    base: "base",
    polygon: "polygon",
    bnb: "bsc",
    hyperevm: "hyperevm",
};

/** Symbols that mean "the boring side of the pair" — the wrapped native or a
 *  stable. The OTHER token is the one a trading feed is about. */
const QUOTE_SYMBOLS = new Set([
    "SOL", "WSOL", "ETH", "WETH", "BNB", "WBNB", "POL", "WPOL", "WMATIC",
    "HYPE", "WHYPE", "USDC", "USDC.E", "USDBC", "USDT", "DAI",
]);

interface MobulaPairToken {
    address?: string;
    symbol?: string;
    name?: string;
    logo?: string | null;
    price?: number;
    marketCap?: number;
    bonded?: boolean | null;
    bondingPercentage?: number | null;
    // Holder-quality stats ride free on every pair token — the boards' risk
    // flag costs no extra API call.
    top10HoldingsPercentage?: number | null;
    snipersHoldingsPercentage?: number | null;
    insidersHoldingsPercentage?: number | null;
    bundlersHoldingsPercentage?: number | null;
    devHoldingsPercentage?: number | null;
}

interface MobulaPairRaw {
    price?: number;
    price_change_5min?: number;
    price_change_1h?: number;
    price_change_6h?: number;
    price_change_24h?: number;
    created_at?: string;
    holders_count?: number;
    volume_5min?: number;
    volume_1h?: number;
    volume_24h?: number;
    trades_24h?: number;
    liquidity?: number;
    source?: string;
    pair?: { address?: string; token0?: MobulaPairToken; token1?: MobulaPairToken };
}

/** One pair, flattened to the token the feed is about. */
export interface MobulaPair {
    tokenAddress: string;
    symbol: string;
    name: string;
    logo: string | null;
    priceUsd: number;
    marketCap: number;
    /** Dollars, or null when unknown — see the note at the mapping site. The
     *  pairs endpoint does NOT supply this; it arrives from the security
     *  screen (`MobulaTokenSecurity.liquidityUsd`). */
    liquidity: number | null;
    volume24h: number;
    volume1h: number;
    volume5m: number;
    change24h: number;
    change1h: number;
    change5m: number;
    change6h: number;
    trades24h: number;
    holders: number;
    createdAtMs: number | null;
    source: string;
    bonded: boolean | null;
    bondingPercentage: number | null;
    pairAddress: string | null;
    top10Pct: number | null;
    snipersPct: number | null;
    insidersPct: number | null;
    bundlersPct: number | null;
    devPct: number | null;
}

/** The side of the pair worth showing: not the wrapped native / stable. When
 *  neither side is a known quote, token0 — pair convention puts the base first. */
function interestingToken(p: MobulaPairRaw): MobulaPairToken | null {
    const t0 = p.pair?.token0;
    const t1 = p.pair?.token1;
    if (!t0 || !t1) return t0 ?? t1 ?? null;
    const q0 = QUOTE_SYMBOLS.has((t0.symbol ?? "").toUpperCase());
    const q1 = QUOTE_SYMBOLS.has((t1.symbol ?? "").toUpperCase());
    if (q0 && !q1) return t1;
    if (q1 && !q0) return t0;
    return t0;
}

/** The coin page's network slugs (GeckoTerminal vocabulary, what resolveCoin
 *  stores) → the `blockchain` param Mobula's token endpoints accept. */
const COIN_NETWORKS: Record<string, string> = {
    solana: "solana",
    eth: "ethereum",
    ethereum: "ethereum",
    base: "base",
    polygon_pos: "polygon",
    polygon: "polygon",
    bsc: "bsc",
    bnb: "bsc",
    avax: "avalanche",
    avalanche: "avalanche",
    hyperevm: "hyperevm",
    arbitrum: "arbitrum",
    optimism: "optimism",
};

export function mobulaCoinBlockchain(network: string): string | null {
    return COIN_NETWORKS[network.toLowerCase()] ?? null;
}

export interface MobulaTrade {
    account: string;
    isBuy: boolean;
    usdValue: number;
    tokenAmount: number;
    /** Unix seconds. */
    ts: number;
    txHash: string;
    /**
     * Execution price in USD (`baseTokenPriceUSD`) — already in the response,
     * previously dropped on the floor.
     *
     * It is what lets the same fetch that fills the trades table also advance
     * the chart (lib/coins/record-mobula-trades): a candle needs a price, and
     * deriving one from usd/amount loses precision on dust trades when the
     * upstream already computed it exactly.
     *
     * Nullable because it is a provider's field, not ours — a row without one
     * is skipped by the persister rather than written with a guess.
     */
    priceUsd: number | null;
}

/**
 * Recent trades for ANY token on any covered chain — what freed the coin
 * page's trades/holders board from its Solana-only pool reader. REST because
 * Mobula's websockets are gated to their Growth plan (verified live 2026-08-06:
 * "WebSocket usage is allowed only on Growth and Enterprise plans"); the tRPC
 * layer caches this per coin so every viewer shares one upstream hit per window.
 */
export async function fetchMobulaTokenTrades(
    network: string,
    address: string,
    limit = 100,
): Promise<MobulaTrade[] | null> {
    if (!mobulaEnabled()) return null;
    const blockchain = mobulaCoinBlockchain(network);
    if (!blockchain) return null;

    const url = new URL(`${isDemo() ? DEMO_BASE : LIVE_BASE}/2/token/trades`);
    url.searchParams.set("address", address);
    url.searchParams.set("blockchain", blockchain);
    url.searchParams.set("limit", String(limit));
    // The swap RECIPIENT is the trader — routers/aggregators sit in the middle
    // of transactionSenderAddress on routed swaps.
    url.searchParams.set("useSwapRecipient", "true");

    const headers: Record<string, string> = { Accept: "application/json" };
    if (!isDemo()) headers.Authorization = rawKey();

    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`mobula trades ${res.status}`);

    const json = (await res.json()) as {
        data?: {
            type?: string;
            baseTokenAmount?: number;
            baseTokenAmountUSD?: number;
            baseTokenPriceUSD?: number;
            date?: number;
            swapRecipient?: string;
            transactionSenderAddress?: string;
            transactionHash?: string;
        }[];
    };
    return (json.data ?? [])
        // SWAPS ONLY. This endpoint returns liquidity operations alongside
        // trades, and on EVM chains they are the MAJORITY — measured 2026-08-12,
        // BRETT/base returned 625 `withdrawal` + 278 `deposit` against 68 buys
        // and 29 sells in one 1,000-row page.
        //
        // Everything downstream was consuming them as trades, because the map
        // below reads `type === "buy"` and anything else became a sell:
        //
        //   - the coin page's table showed 90% phantom $0 sells;
        //   - `coinTraderConcentration` scored them, which put BRETT's top-5
        //     share at 89.6% (flagged "concentrated") against 34.0% on its real
        //     swaps — the card was calling a healthy coin wash-traded;
        //   - the candle projection skipped them only by accident, because a
        //     liquidity row carries no price.
        //
        // Solana rows are typed too (`buy`/`sell`), so this is not an EVM
        // special case — it is the filter that endpoint always needed.
        .filter((t) => t.type === "buy" || t.type === "sell")
        .map((t) => ({
            account: t.swapRecipient || t.transactionSenderAddress || "",
            isBuy: t.type === "buy",
            usdValue: t.baseTokenAmountUSD ?? 0,
            tokenAmount: t.baseTokenAmount ?? 0,
            // `date` is MILLISECONDS here and unix SECONDS everywhere in our
            // tape — coin_trades.ts, candle buckets, the UDF window.
            ts: t.date ? Math.floor(t.date / 1000) : 0,
            txHash: t.transactionHash ?? "",
            priceUsd:
                typeof t.baseTokenPriceUSD === "number" && t.baseTokenPriceUSD > 0
                    ? t.baseTokenPriceUSD
                    : null,
        }))
        .filter((t) => t.account && t.ts > 0);
}

export interface MobulaHolder {
    /** Owner address. */
    address: string;
    /** Balance in whole tokens. */
    amount: number;
    /** Percent of total supply, 0–100. */
    sharePercent: number;
    /** USD value of the position, when Mobula prices the token. */
    usdValue: number | null;
}

/**
 * Top holders for a token.
 *
 * ## Why this is not Helius
 *
 * `trade.getHolders` used to call Helius DAS `getTokenAccounts` + `getTokenSupply`
 * and aggregate token ACCOUNTS into owners by hand. That worked, and it was the
 * wrong provider: holder distribution is market data, and Helius is the app's
 * operations provider (RPC, wallets, the user's own trade history). Every credit
 * spent answering "who holds this coin" is a credit not available for signing
 * and reading wallets.
 *
 * It was also Solana-only by construction — DAS has no notion of an ERC-20 —
 * so the holders table simply had nothing to show on the five EVM chains the
 * board now covers.
 *
 * Mobula returns owner, balance and supply share in ONE call, on every chain we
 * list. `totalSupplyShare` is computed upstream, which removes the second
 * (supply) request and the division that went with it.
 *
 * Verified against the live endpoint 2026-08-12: BONK/solana top holder 7.68%,
 * BRETT/base 11.47%. Note the free plan is 1 REQUEST PER SECOND — three calls
 * fired back to back returned 429 — so callers must be cached, never a loop.
 */
export async function fetchMobulaTokenHolders(
    network: string,
    address: string,
    limit = 20,
): Promise<MobulaHolder[] | null> {
    if (!mobulaEnabled()) return null;
    const blockchain = mobulaCoinBlockchain(network);
    if (!blockchain) return null;

    const url = new URL(`${isDemo() ? DEMO_BASE : LIVE_BASE}/1/market/token/holders`);
    // `asset`, NOT `address` — this endpoint 400s with "Asset is required" on
    // the parameter name every other endpoint in this file uses.
    url.searchParams.set("asset", address);
    url.searchParams.set("blockchain", blockchain);
    url.searchParams.set("limit", String(Math.min(100, Math.max(1, limit))));

    const headers: Record<string, string> = { Accept: "application/json" };
    if (!isDemo()) headers.Authorization = rawKey();

    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`mobula holders ${res.status}`);

    const json = (await res.json()) as {
        data?: { address?: string; amount?: number; totalSupplyShare?: number; amountUSD?: number }[];
    };
    return (json.data ?? [])
        .filter((h) => !!h.address)
        .map((h) => ({
            address: h.address!,
            amount: typeof h.amount === "number" ? h.amount : 0,
            sharePercent: typeof h.totalSupplyShare === "number" ? h.totalSupplyShare : 0,
            usdValue: typeof h.amountUSD === "number" ? h.amountUSD : null,
        }));
}

/**
 * Cache key for the security block. Shared, and VERSIONED — three call sites
 * (trade.coinSecurity, discovery's screenSecurity, rescreenTracked) read the
 * same entry, so a shape change has to invalidate all of them at once or two of
 * them quietly parse a payload that predates the new field.
 */
export function securityCacheKey(network: string, address: string): string {
    return `coin:security:v2:${network}:${address}`;
}

export interface MobulaTokenSecurity {
    holdersCount: number | null;
    securityScore: number | null;
    top10Pct: number | null;
    devPct: number | null;
    snipersPct: number | null;
    snipersCount: number | null;
    insidersPct: number | null;
    insidersCount: number | null;
    bundlersPct: number | null;
    bundlersCount: number | null;
    liquidityBurnPct: number | null;
    /**
     * REAL liquidity in dollars — the only place in this API that gives one.
     *
     * The pairs endpoint's `liquidity` field is NOT dollars. Measured
     * 2026-08-12 on `/1/market/blockchain/pairs`, one row carried
     * `liquidity: 0.00000038` beside `volume_24h: 80,068,102` for the same
     * pair. `/2/token/details` reports `liquidityUSD` for the same tokens and
     * it is sane: BONK $57.7k, USDC $15.7M.
     *
     * That mattered more than a wrong number on screen. `clearsBrandBar` lets a
     * brand-squatting coin through once it holds BRAND_SQUAT_MIN_LIQUIDITY_USD,
     * so the escape hatch was being granted (and denied) on noise — CLAUDE and
     * OPENAI were firing alerts with "liquidity" that meant nothing.
     */
    liquidityUsd: number | null;
    noMintAuthority: boolean | null;
    isFreezable: boolean | null;
    buyTaxPct: number | null;
    sellTaxPct: number | null;
    honeypotFlag: boolean | null;
    /**
     * Social links, which this endpoint has always returned and we always threw
     * away. External coins had no socials ANYWHERE in the app — `hasSocials` is
     * `{}` for every chain-wide feed row and `resolveCoin` never carried them —
     * so a coin page for anything we didn't launch showed none.
     *
     * Free: same response, same call, same cache entry. GeckoTerminal's
     * `/tokens/{addr}/info` also has them (`twitter_handle`, `websites`) but
     * that would be a second request per coin.
     */
    socials: { twitter: string | null; website: string | null; telegram: string | null } | null;
    /**
     * Token logo — the same free-data case as `socials` above, and the fix for
     * a visible gap rather than a nice-to-have.
     *
     * `image_url` on `tracked_tokens` / `trending_coins` comes from
     * GeckoTerminal, which returns nothing for some coins (measured 2026-08-11:
     * 2.9% of tracked, 9.3% of trending). That is a hole in GT's COVERAGE, not
     * a property of the coin — 11 of the 20 imageless trending coins hold over
     * $250k liquidity — so those coins render blank for no good reason.
     *
     * Mobula has logos for them (spot-checked against KITTENS/solana and
     * SAMI/base, both null in GT), and it arrives in THIS response, on a call
     * the security screen already makes. Free.
     */
    logo: string | null;
}

/** Holder-quality + contract-safety stats for one token — the MTT-style
 *  security block. One GET to token/details, heavily cacheable. */
export async function fetchMobulaTokenSecurity(
    network: string,
    address: string,
): Promise<MobulaTokenSecurity | null> {
    if (!mobulaEnabled()) return null;
    const blockchain = mobulaCoinBlockchain(network);
    if (!blockchain) return null;

    const url = new URL(`${isDemo() ? DEMO_BASE : LIVE_BASE}/2/token/details`);
    url.searchParams.set("address", address);
    url.searchParams.set("blockchain", blockchain);

    const headers: Record<string, string> = { Accept: "application/json" };
    if (!isDemo()) headers.Authorization = rawKey();

    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`mobula details ${res.status}`);

    const json = (await res.json()) as { data?: Record<string, unknown> };
    const d = json.data;
    if (!d) return null;
    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const sec = (d.security ?? {}) as Record<string, unknown>;
    const tax = (v: unknown): number | null => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : null;
    };
    return {
        holdersCount: num(d.holdersCount),
        securityScore: num(d.securityScore),
        top10Pct: num(d.top10HoldingsPercentage),
        devPct: num(d.devHoldingsPercentage),
        snipersPct: num(d.snipersHoldingsPercentage),
        snipersCount: num(d.snipersCount),
        insidersPct: num(d.insidersHoldingsPercentage),
        insidersCount: num(d.insidersCount),
        bundlersPct: num(d.bundlersHoldingsPercentage),
        bundlersCount: num(d.bundlersCount),
        liquidityBurnPct: num(d.liquidityBurnPercentage),
        // `liquidityUSD` first, `approximateReserveUSD` as the fallback — both
        // appear on this response and both are real dollars (measured on BONK:
        // 57,721 and 109,159 respectively; the reserve is the pool's total,
        // the liquidity figure is the tradeable side).
        liquidityUsd: num(d.liquidityUSD) ?? num(d.approximateReserveUSD),
        noMintAuthority: typeof sec.noMintAuthority === "boolean" ? sec.noMintAuthority : null,
        isFreezable: typeof sec.isFreezable === "boolean" ? sec.isFreezable : null,
        buyTaxPct: tax(sec.buyTax),
        sellTaxPct: tax(sec.sellTax),
        honeypotFlag: typeof sec.isBlacklisted === "boolean" ? sec.isBlacklisted : null,
        socials: (() => {
            const raw = d.socials as Record<string, unknown> | undefined;
            if (!raw) return null;
            // Only http(s) — the payload also carries an `others` bag with
            // arbitrary metadata (IPFS URIs, file blobs) that must never reach
            // an href.
            const url = (v: unknown) =>
                typeof v === "string" && /^https?:\/\//i.test(v.trim()) ? v.trim() : null;
            const twitter = url(raw.twitter);
            const website = url(raw.website);
            const telegram = url(raw.telegram);
            return twitter || website || telegram ? { twitter, website, telegram } : null;
        })(),
        // http(s) only, for the same reason as socials: this payload also
        // carries IPFS URIs and file blobs, and an <img src> is no safer a
        // destination for one than an href. `originLogoUrl` is deliberately
        // ignored — it points at the issuer's own host, which for a spam token
        // is an arbitrary attacker-controlled URL; Mobula's own CDN copy is not.
        logo: (() => {
            const v = d.logo;
            return typeof v === "string" && /^https?:\/\//i.test(v.trim()) ? v.trim() : null;
        })(),
    };
}

/**
 * Chain-wide pairs, for /trade's chain feed.
 *
 * `list` picks the board: "trending" is volume-ranked, "new" is the endpoint's
 * natural newest-first order. Returns null (not []) when the provider is off or
 * the chain unsupported, same convention as the candle fetch above.
 */
export async function fetchMobulaChainPairs(
    chain: string,
    list: "trending" | "new",
    limit = 100,
): Promise<MobulaPair[] | null> {
    if (!mobulaEnabled()) return null;
    const blockchain = PAIR_BLOCKCHAINS[chain.toLowerCase()];
    if (!blockchain) return null;

    const url = new URL(`${isDemo() ? DEMO_BASE : LIVE_BASE}/1/market/blockchain/pairs`);
    url.searchParams.set("blockchain", blockchain);
    url.searchParams.set("limit", String(limit));
    if (list === "trending") {
        url.searchParams.set("sortBy", "volume_24h");
        url.searchParams.set("sortOrder", "desc");
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (!isDemo()) headers.Authorization = rawKey();

    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`mobula pairs ${res.status}`);

    const json = (await res.json()) as { data?: MobulaPairRaw[] };
    return mapPairRows(json.data ?? []);
}

/** Raw pair rows → one `MobulaPair` per token. Shared by the pairs endpoint
 *  and Pulse below — the two return the same row shape, verified 2026-08-13. */
function mapPairRows(rows: MobulaPairRaw[]): MobulaPair[] {
    const out: MobulaPair[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
        const token = interestingToken(row);
        if (!token?.address || !token.symbol) continue;
        // One row per token: the same coin trades in many pools, and a feed
        // that lists WIF five times reads as a bug. Keep the first (highest
        // volume on trending, newest on new).
        if (seen.has(token.address)) continue;
        seen.add(token.address);
        out.push({
            tokenAddress: token.address,
            symbol: token.symbol,
            name: token.name ?? token.symbol,
            logo: token.logo ?? null,
            priceUsd: token.price ?? row.price ?? 0,
            marketCap: token.marketCap ?? 0,
            // ⚠️ NOT `row.liquidity`. That field is not dollars — see
            // MobulaTokenSecurity.liquidityUsd for the measurement (0.00000038
            // beside $80M of 24h volume, same row). Writing it into a column
            // named `liquidity_usd` produced a board that filtered on a unit
            // nobody could name.
            //
            // `null` rather than 0, and the distinction is the whole point:
            // "we do not know this coin's liquidity" and "this coin has no
            // liquidity" lead to opposite decisions, and this codebase has
            // already been bitten by conflating them once (securityScore read 0
            // for healthy coins and rejected 20 of 20 audited tokens).
            //
            // The real figure arrives per-coin from the security screen, which
            // is one call we already make.
            liquidity: null,
            volume24h: row.volume_24h ?? 0,
            volume1h: row.volume_1h ?? 0,
            volume5m: row.volume_5min ?? 0,
            change24h: row.price_change_24h ?? 0,
            change1h: row.price_change_1h ?? 0,
            change5m: row.price_change_5min ?? 0,
            change6h: row.price_change_6h ?? 0,
            trades24h: row.trades_24h ?? 0,
            holders: row.holders_count ?? 0,
            createdAtMs: row.created_at ? Date.parse(row.created_at) : null,
            source: row.source ?? "",
            bonded: token.bonded ?? null,
            bondingPercentage: token.bondingPercentage ?? null,
            pairAddress: row.pair?.address ?? null,
            top10Pct: token.top10HoldingsPercentage ?? null,
            snipersPct: token.snipersHoldingsPercentage ?? null,
            insidersPct: token.insidersHoldingsPercentage ?? null,
            bundlersPct: token.bundlersHoldingsPercentage ?? null,
            devPct: token.devHoldingsPercentage ?? null,
        });
    }
    return out;
}

// ── Pulse: the launchpad lifecycle feed (the /trade memescope's source) ──────
//
// GET /api/2/pulse returns THREE LANES per chain — new / bonding / bonded —
// and, unlike the pairs endpoint above, it serves the BONDING PHASE: pump.fun
// coins mid-curve, with holders and bondingPercentage attached. Measured
// 2026-08-13 against the live key: solana's `new` lane carried a coin at 27.8%
// curve with 5 holders and `bonding` had 49 mid-curve rows — while the pairs
// endpoint's "newest" 40 rows were ALL post-migration PumpSwap/Meteora pools,
// hours old. The pairs feed is pool-shaped, and a pump.fun coin has no pool
// until it graduates; Pulse is the endpoint that sees it before that.
//
// It is also the Robinhood Chain source: pairs 500s on evm:4663, Pulse serves
// it, launchpads (Klik/Flap/hoodfun…) included. Docs say all plans; verified
// on ours.

/** /trade's chain ids → Pulse `chainId` values (a different vocabulary from
 *  PAIR_BLOCKCHAINS: ecosystem-prefixed, EVM chains by numeric id). */
const PULSE_CHAIN_IDS: Record<string, string> = {
    solana: "solana:solana",
    ethereum: "evm:1",
    base: "evm:8453",
    polygon: "evm:137",
    bnb: "evm:56",
    hyperevm: "evm:999",
    robinhood: "evm:4663",
};

/** The three Pulse lanes. `fresh` is the endpoint's `new` — renamed so callers
 *  can destructure without colliding with the keyword everywhere. */
export interface MobulaPulseLanes {
    fresh: MobulaPair[];
    bonding: MobulaPair[];
    bonded: MobulaPair[];
}

/** Null = provider off or a chain Pulse doesn't cover — a real, cacheable
 *  answer, distinct from a thrown upstream failure (same contract as the
 *  pairs fetch above). */
export async function fetchMobulaPulse(chain: string, limit = 50): Promise<MobulaPulseLanes | null> {
    if (!mobulaEnabled()) return null;
    const chainId = PULSE_CHAIN_IDS[chain.toLowerCase()];
    if (!chainId) return null;

    const url = new URL(`${isDemo() ? DEMO_BASE : LIVE_BASE}/2/pulse`);
    url.searchParams.set("chainId", chainId);
    url.searchParams.set("limit", String(limit));

    const headers: Record<string, string> = { Accept: "application/json" };
    if (!isDemo()) headers.Authorization = rawKey();

    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`mobula pulse ${res.status}`);

    const json = (await res.json()) as {
        new?: { data?: MobulaPairRaw[] };
        bonding?: { data?: MobulaPairRaw[] };
        bonded?: { data?: MobulaPairRaw[] };
    };
    return {
        fresh: mapPairRows(json.new?.data ?? []),
        bonding: mapPairRows(json.bonding?.data ?? []),
        bonded: mapPairRows(json.bonded?.data ?? []),
    };
}

/**
 * Fetch candles for a token, in OUR shape (`ts` in unix SECONDS).
 *
 * Returns null — not an empty array — when this path can't serve the request,
 * so the caller can tell "provider is off / chain unsupported" (fall through to
 * GT) apart from "provider answered, this window is genuinely empty".
 */
export async function fetchMobulaCandles(
    tokenAddress: string,
    network: string,
    resolution: string,
    from: number,
    to: number,
    limit = MAX_CANDLES,
): Promise<Candle[] | null> {
    if (!mobulaEnabled()) return null;

    const period = mobulaPeriod(resolution);
    const chainId = mobulaChainId(network);
    if (!period || !chainId) return null;

    const url = new URL(`${isDemo() ? DEMO_BASE : LIVE_BASE}/2/token/ohlcv-history`);
    url.searchParams.set("address", tokenAddress);
    url.searchParams.set("chainId", chainId);
    url.searchParams.set("period", period);
    // Their from/to are MILLISECONDS; ours are seconds. Mixing these up doesn't
    // error, it just returns an empty window forever.
    url.searchParams.set("from", String(from * 1000));
    url.searchParams.set("to", String(to * 1000));
    url.searchParams.set("amount", String(Math.min(MAX_CANDLES, Math.max(1, limit))));
    url.searchParams.set("usd", "true");

    const headers: Record<string, string> = { Accept: "application/json" };
    // The demo host rejects an Authorization header; only send one when live.
    if (!isDemo()) headers.Authorization = rawKey();

    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`mobula ohlcv ${res.status}`);

    const json = (await res.json()) as { data?: MobulaCandle[] };
    const rows = json.data ?? [];

    return rows
        .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.c))
        // ms → s, matching coin_candles and the UDF contract.
        .map((r) => ({ ts: Math.floor(r.t / 1000), o: r.o, h: r.h, l: r.l, c: r.c, v: r.v ?? 0 }))
        .filter((b) => b.ts >= from && b.ts <= to)
        .sort((a, b) => a.ts - b.ts);
}
