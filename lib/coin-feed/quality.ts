// Alert-quality gates — pure and unit-tested (tests/feed-quality.test.ts).
//
// The observed failure (2026-08-07): the alert rail recommending $CLAUDE /
// $ANTHROPIC coins. Launch-day pumps clear the per-network liquidity/volume
// floors easily, and a coin named after a famous brand is overwhelmingly rug
// bait riding the name. This is a HIGH BAR, not a ban: a brand-squatting name
// may still alert once it carries liquidity no drive-by rug bothers to fake.

/** Liquidity a brand-riding coin must hold before it may enter the alert
 *  watch list. Rugs pump VOLUME cheaply; parked liquidity is what they don't
 *  leave lying around. */
export const BRAND_SQUAT_MIN_LIQUIDITY_USD = 250_000;

/** Substring-matched against symbol AND name, lowercased. Deliberately the
 *  names spam actually rides — AI labs/products and perennially-squatted
 *  companies — not a general profanity/brand registry. Extend as observed. */
const BRAND_TERMS = [
    // AI labs and products — the reported spam.
    "claude",
    "anthropic",
    "openai",
    "chatgpt",
    "gpt-5",
    "gpt5",
    "deepseek",
    "midjourney",
    "copilot",
    "grok",
    // Perennially-squatted companies.
    "tesla",
    "spacex",
    "nvidia",
    "microsoft",
    "coinbase",
    "binance",
    "blackrock",
    // Found 2026-08-11 by `bun scripts/coin-feed/audit-spam.ts`, which reviews
    // the coins this gate ACCEPTED and reports what it could not see. Both were
    // live on the watch list below the brand bar, i.e. recognising them rejects
    // them outright rather than merely raising the bar:
    //   SanDisk  $154,494 liquidity
    //   Unitree  $68,969  (also squatted under its Chinese name, 宇树科技)
    "sandisk",
    "unitree",
    // Found 2026-08-12 by running the reviewer over the TRENDING BOARD rather
    // than over adoption candidates — GOOGLE was sitting in the top 60 by 24h
    // volume. `alphabet` is deliberately absent: it is an ordinary English
    // word and would fail real coins, the same reason `coin` and `meta` are.
    "google",
];

/**
 * Ambiguous words matched on WORD BOUNDARIES, not substrings — $APPLE and
 * "Apple Coin" ride the brand, $PINEAPPLE is a fruit. (Reported culprits
 * 2026-08-07: nvidia, openai, apple.)
 *
 * ## Tickers, added 2026-08-10 from production
 *
 * `BRAND_TERMS` above lists brands by NAME, and squatters overwhelmingly use
 * the **stock ticker**. Measured on the live watch list, 49 of 300 slots — 16%
 * — were two tickers this gate did not recognise:
 *
 *     HOOD   37 rows   min liquidity $136,439   (Robinhood)
 *     NVDA   12 rows   min liquidity $407,711   (Nvidia — "nvidia" IS in
 *                                                BRAND_TERMS; NVDA is not)
 *
 * The HOOD rows are the point: at $136k liquidity they sit BELOW
 * BRAND_SQUAT_MIN_LIQUIDITY_USD and would have been rejected outright had the
 * gate known what they were. It didn't, so they took slots on the alert rail
 * built to keep them off it — the same $CLAUDE/$ANTHROPIC failure from
 * 2026-08-07, wearing a ticker.
 *
 * This list already anticipated the pattern (`aapl` sits beside `apple`) and
 * then stopped at one brand. The comment above says "extend as observed"; this
 * is the observation.
 *
 * ⚠️ Word boundaries are load-bearing here, far more than for names. `hood`
 * as a substring eats NEIGHBORHOOD and ROBINHOOD; `\bhood\b` does not.
 *
 * ⚠️ Two tickers are deliberately ABSENT. `COIN` (Coinbase) and `META` (Meta)
 * are ordinary crypto vocabulary — "coin" appears in a large share of token
 * names — and gating on them would fail a real coin for using a normal word.
 * The brands themselves stay covered by name in BRAND_TERMS, which is safe as
 * a substring. A ticker only earns a place here when it is not also a word.
 */
const BRAND_WORDS = [
    // Observed squatting the live watch list.
    "aapl", "apple",
    "nvda",
    "hood", "robinhood",
    // Completing tickers for brands already listed by name above, so the two
    // halves of one decision don't drift apart again.
    "tsla",
    "msft",
    "mstr",
    // Found 2026-08-11 by scripts/coin-feed/audit-spam.ts (see BRAND_TERMS).
    // Both are pure tickers that are not also words, which is the bar this list
    // sets — SNDK was on the watch list at $154k and AMD at $68k, both under
    // the brand bar.
    "sndk",
    "amd",
];
const BRAND_WORD_RE = new RegExp(`\\b(${BRAND_WORDS.join("|")})\\b`, "i");

/**
 * Stock and ETF tickers — the impersonation this board actually gets.
 *
 * Measured 2026-08-12 by running the reviewer over every visible coin: 146 of
 * 434 were flagged, and the flags are dominated by TOKENISED EQUITY names —
 * NVDA, MU, SNDK, NBIS, SPYB, QQQB, MGUSD. Not memecoins riding a brand; stock
 * tickers.
 *
 * That reframes the problem in a way that makes it finite. "Brands" is an
 * unbounded set somebody maintains forever; TICKERS are a closed, public,
 * enumerable list. This is the S&P-100-and-major-ETF core of it, which covers
 * the observed cases, and it grows from `scripts/coin-feed/audit-feeds.ts`
 * rather than from taste.
 *
 * ⚠️ This list is only safe BECAUSE of the verified-mint exemption in
 * `clearsBrandBar`. Several of these are legitimately tokenised — Ondo, Backed
 * and others issue real equity tokens — so matching a ticker cannot mean
 * "hide". It means "hide unless a canonical registry vouches for it". Without
 * that exemption this list would hide real assets, which is precisely the
 * mistake the $250k liquidity proxy was making in the other direction.
 *
 * Word-boundary matched, like BRAND_WORDS: `MU` as a substring would eat MUSK,
 * MUMU and MUTANT.
 *
 * ⚠️ DELIBERATELY ABSENT, and a test enforces the first two: COIN (Coinbase),
 * META, SPY, RIOT, DIA, KO, MA, GS, HD, PG, SQ, MS. Each is either ordinary
 * English, ordinary crypto vocabulary, or two letters that collide with
 * everything — and the rule this file already sets is that a ticker earns a
 * place here only when it is NOT also a word. DIA is itself a real crypto
 * oracle token, which is the failure mode in miniature.
 */
const STOCK_TICKERS = [
    // Observed impersonating on the live board.
    "nvda", "sndk", "mu", "nbis", "spyb", "qqqb", "mgusd", "spcxb",
    // Mega-caps and the tickers most often tokenised.
    "aapl", "msft", "goog", "googl", "amzn", "tsla", "nflx", "amd",
    "intc", "orcl", "crm", "adbe", "csco", "qcom", "txn", "avgo", "smci",
    "jpm", "bac", "wfc", "brk", "visa", "pypl",
    "wmt", "cost", "nke", "sbux", "mcd", "pep", "dis",
    "xom", "cvx", "unh", "jnj", "pfe", "mrna", "lly", "abbv",
    "baba", "nio", "pltr", "rblx", "abnb", "uber", "lyft", "snap", "pins",
    "mstr", "mara", "hood",
    // Index and commodity ETFs.
    "qqq", "iwm", "vti", "voo", "arkk", "gld", "slv", "tlt",
] as const;
const STOCK_TICKER_RE = new RegExp(`\\b(${STOCK_TICKERS.join("|")})\\b`, "i");

/** True when the symbol or name reads as a stock/ETF ticker. Separate from
 *  `isBrandSquat` so callers can weigh them differently — a ticker match is
 *  strong evidence of tokenised-equity impersonation specifically. */
export function isStockTicker(symbol: string, name: string | null | undefined): boolean {
    return STOCK_TICKER_RE.test(`${symbol} ${name ?? ""}`);
}

export function isBrandSquat(symbol: string, name: string | null | undefined): boolean {
    const hay = `${symbol} ${name ?? ""}`.toLowerCase();
    return (
        BRAND_TERMS.some((t) => hay.includes(t)) ||
        BRAND_WORD_RE.test(hay) ||
        STOCK_TICKER_RE.test(hay)
    );
}

// ── Holder-quality risk (Mobula security stats) ─────────────────────────────
//
// One set of thresholds serving two surfaces: the boards' "hide risky coins"
// toggle (fields ride free on the pairs feed) and the alert watch list's
// adoption gate (cached token/details lookup). Null-safe and fail-OPEN: brand
// new coins report nothing, and "no data" must never read as "risky".

export interface HoldingsRisk {
    top10Pct: number | null;
    snipersPct: number | null;
    insidersPct: number | null;
    bundlersPct: number | null;
    devPct: number | null;
}

/** Concentration levels at which a coin is one wallet-cluster's exit event. */
export function isRiskyHoldings(h: HoldingsRisk): boolean {
    return (
        (h.top10Pct ?? 0) >= 80 ||
        (h.snipersPct ?? 0) >= 40 ||
        (h.insidersPct ?? 0) >= 40 ||
        (h.bundlersPct ?? 0) >= 40 ||
        (h.devPct ?? 0) >= 30
    );
}

/**
 * The alert-adoption bar: contract flags plus the holdings thresholds.
 * Fail-open on missing data — the gate exists to stop KNOWN-bad coins.
 *
 * ## Mint authority and freeze authority (added 2026-08-10)
 *
 * `fetchMobulaTokenSecurity` has always returned `noMintAuthority` and
 * `isFreezable`, and this gate ignored both — we were paying for the fields and
 * throwing them away. They are the two checks every Solana sniper bot runs
 * first, and unlike most of that genre they are not judgement calls:
 *
 * - **Mint authority still live** means the deployer can print unlimited supply
 *   and dilute every holder to nothing, at will, after you buy.
 * - **Freezable** means the authority can freeze your token account. You can
 *   buy and then simply not be allowed to sell — a honeypot by a different
 *   mechanism than the one `honeypotFlag` catches.
 *
 * Verified against `fdundjer/solana-sniper-bot`'s actual filter set
 * (`CHECK_IF_MINT_IS_RENOUNCED`, `CHECK_IF_FREEZABLE`, `CHECK_IF_BURNED`,
 * `CHECK_IF_MUTABLE`, `CHECK_IF_SOCIALS`) rather than a description of it.
 *
 * Compared explicitly against `false`/`true` rather than truthily, because
 * `null` means "no data" and must keep passing — a brand-new coin reports
 * nothing and is not thereby dangerous.
 *
 * ## What is deliberately NOT gated here
 *
 * **`liquidityBurnPct`** is fetched and stays unused on purpose. Burning LP and
 * *locking* LP are both legitimate, and a locked pool reports 0% burned — so a
 * burn threshold would reject well-behaved tokens with the same confidence it
 * rejects rugs. A signal that can't separate the two isn't a gate, it's a coin
 * flip with extra steps. Sniper bots accept that false-positive rate because
 * they only need one good entry; a discovery feed that hides real coins is a
 * different, worse failure.
 *
 * **Mutable metadata** and **socials present** are also unavailable here —
 * Mobula's block carries neither.
 */
export function passesSecurityBar(
    sec:
        | (HoldingsRisk & {
              honeypotFlag: boolean | null;
              buyTaxPct: number | null;
              sellTaxPct: number | null;
              securityScore: number | null;
              noMintAuthority?: boolean | null;
              isFreezable?: boolean | null;
          })
        | null
        | undefined,
): boolean {
    if (!sec) return true;
    if (sec.honeypotFlag) return false;
    // Unlimited supply on demand, and no-sell-allowed, respectively.
    if (sec.noMintAuthority === false) return false;
    if (sec.isFreezable === true) return false;
    if ((sec.buyTaxPct ?? 0) > 10 || (sec.sellTaxPct ?? 0) > 10) return false;
    // ⚠️ securityScore is NOT gated on. Measured against the live Mobula API
    // 2026-08-10, it is 0 for coins whose every granular field is healthy:
    //
    //   ANTHROPIC  score 0   top10 18.4%  dev 0%  noMint true  freezable false
    //   CLAUDE     score 0   top10 18.5%  dev 0%  noMint true  freezable false
    //   OPENAI     score 0   top10 34.8%  17,291 holders
    //   NVDA       score 6   top10 18.3%  dev 0%  noMint true  freezable false
    //
    // `securityScore < 30` therefore rejected 20 of 20 audited coins — 100%,
    // which is never a threshold working and always a metric misread. Whatever
    // Mobula means by this field, it is not a 0-100 safety score, and 0 plainly
    // means "not scored" rather than "maximally unsafe".
    //
    // This mattered more than it looks. The rule was near-inert while the gate
    // only reached 12 coins per pass; fixing that budget (c68d5bbb) pointed a
    // reject-everything rule at the whole intake. `scripts/coin-feed/audit-security.ts`
    // caught it before the watch list drained.
    //
    // The granular fields DO discriminate and are kept: the same audit flagged a
    // CLAUDE on base at top10 100% / insiders 100%.
    return !isRiskyHoldings(sec);
}

/** The gate discovery applies on top of the per-network floors: brand-riding
 *  names need the high liquidity bar; everything else passes through to the
 *  normal floors. */
export function clearsBrandBar(
    symbol: string,
    name: string | null | undefined,
    liquidityUsd: number | null | undefined,
    /**
     * Vouched for by a canonical registry (Jupiter's verified list). When true
     * this SHORT-CIRCUITS the liquidity bar.
     *
     * The bar was always a proxy for "this brand-matching coin might be the
     * real one", and it is a bad one in both directions: it let `preOPENAI`
     * through at $5.4M while it would reject a small legitimate project. A
     * registry answers the question the proxy was approximating — measured
     * 2026-08-12, 0 of 18 board impersonators are verified, and CBBTC is.
     *
     * Optional so existing callers keep their old behaviour; pass it wherever
     * the list is available.
     */
    verified = false,
): boolean {
    if (!isBrandSquat(symbol, name)) return true;
    if (verified) return true;
    return (liquidityUsd ?? 0) >= BRAND_SQUAT_MIN_LIQUIDITY_USD;
}
