import { describe, expect, test } from "bun:test";
import {
    clearsBrandBar,
    isBrandSquat,
    isRiskyHoldings,
    passesSecurityBar,
    BRAND_SQUAT_MIN_LIQUIDITY_USD,
} from "@/lib/coin-feed/quality";
import { applyMemescopeFilters, filtersActive, NO_FILTERS } from "@/components/trade/memescope-filter-dialog";
import { collapseCopycats } from "@/components/trade/collapse-copycats";
import type { TradeToken } from "@/components/trade/types";

// The two feed-quality gates from the 2026-08-07 report: brand-squat coins
// ($CLAUDE/$ANTHROPIC) reaching the alert rail, and the same coin name
// listed 3-4 times on the boards.

describe("brand-squat gate", () => {
    test("matches the reported spam, in symbol or name, any casing", () => {
        expect(isBrandSquat("CLAUDE", null)).toBe(true);
        expect(isBrandSquat("AI", "Anthropic Coin")).toBe(true);
        expect(isBrandSquat("BABYCLAUDE", "baby claude to the moon")).toBe(true);
        expect(isBrandSquat("GPT5", null)).toBe(true);
        // Word-boundary brands: the whole word rides the name…
        expect(isBrandSquat("APPLE", "Apple Coin")).toBe(true);
        expect(isBrandSquat("AAPL", "Apple PreStocks")).toBe(true);
        expect(isBrandSquat("NVIDIA", null)).toBe(true);
    });

    test("ordinary memecoins pass untouched", () => {
        expect(isBrandSquat("DOGE", "Doge")).toBe(false);
        expect(isBrandSquat("WIF", "dogwifhat")).toBe(false);
        // …but only as a whole word: pineapple stays a fruit.
        expect(isBrandSquat("PINEAPPLE", "pineapple party")).toBe(false);
    });

    test("high liquidity overrides — a bar, not a ban", () => {
        expect(clearsBrandBar("CLAUDE", null, 3_000)).toBe(false);
        expect(clearsBrandBar("CLAUDE", null, null)).toBe(false);
        expect(clearsBrandBar("CLAUDE", null, BRAND_SQUAT_MIN_LIQUIDITY_USD)).toBe(true);
        expect(clearsBrandBar("DOGE", "Doge", 0)).toBe(true);
    });
});

const tok = (over: Partial<TradeToken>): TradeToken =>
    ({
        id: over.id ?? Math.random().toString(36),
        name: "Pigeon",
        symbol: "PIGEON",
        imageUrl: "",
        platform: "other",
        timeAgo: "1m",
        hasSocials: {},
        holderCount: 1,
        txCount: 1,
        bondingProgress: 10,
        solAmount: 0,
        priceUsd: 0,
        marketCap: 1000,
        volume: 0,
        buyPercent: 0,
        sellPercent: 0,
        changePercent: 0,
        changePercent5m: null,
        changePercent1h: null,
        changePercent6h: null,
        volume5m: null,
        volume1h: null,
        status: "migrating",
        creatorIsLive: false,
        liveViewerCount: 0,
        ...over,
    }) as TradeToken;

describe("collapseCopycats", () => {
    test("keeps the strongest copy and preserves list order", () => {
        const weak = tok({ id: "a", volume: 10 });
        const strong = tok({ id: "b", volume: 5_000 });
        const other = tok({ id: "c", symbol: "DOGE", name: "Doge" });
        const out = collapseCopycats([weak, other, strong]);
        expect(out.map((t) => t.id)).toEqual(["c", "b"]);
    });

    test("same ticker, different name = different coins", () => {
        const a = tok({ id: "a", name: "The Grieving Pigeon" });
        const b = tok({ id: "b", name: "Pigeon Of War" });
        expect(collapseCopycats([a, b])).toHaveLength(2);
    });

    test("an in-house launch beats a richer external copy", () => {
        const external = tok({ id: "x", volume: 1_000_000, external: true, chain: "solana" });
        const inHouse = tok({ id: "h", volume: 5 });
        expect(collapseCopycats([external, inHouse]).map((t) => t.id)).toEqual(["h"]);
    });

    test("ties keep the first occurrence", () => {
        const a = tok({ id: "a", volume: 100, marketCap: 100 });
        const b = tok({ id: "b", volume: 100, marketCap: 100 });
        expect(collapseCopycats([a, b]).map((t) => t.id)).toEqual(["a"]);
    });
});

const NO_RISK = { top10Pct: null, snipersPct: null, insidersPct: null, bundlersPct: null, devPct: null };

describe("holdings risk + security bar", () => {
    test("thresholds, per axis", () => {
        expect(isRiskyHoldings(NO_RISK)).toBe(false);
        expect(isRiskyHoldings({ ...NO_RISK, top10Pct: 80 })).toBe(true);
        expect(isRiskyHoldings({ ...NO_RISK, top10Pct: 79.9 })).toBe(false);
        expect(isRiskyHoldings({ ...NO_RISK, snipersPct: 40 })).toBe(true);
        expect(isRiskyHoldings({ ...NO_RISK, insidersPct: 40 })).toBe(true);
        expect(isRiskyHoldings({ ...NO_RISK, bundlersPct: 40 })).toBe(true);
        expect(isRiskyHoldings({ ...NO_RISK, devPct: 30 })).toBe(true);
    });

    test("security bar: fail-open on missing data, hard-fail on flags", () => {
        expect(passesSecurityBar(null)).toBe(true);
        expect(passesSecurityBar({ ...NO_RISK, honeypotFlag: null, buyTaxPct: null, sellTaxPct: null, securityScore: null })).toBe(true);
        expect(passesSecurityBar({ ...NO_RISK, honeypotFlag: true, buyTaxPct: null, sellTaxPct: null, securityScore: null })).toBe(false);
        expect(passesSecurityBar({ ...NO_RISK, honeypotFlag: false, buyTaxPct: 11, sellTaxPct: null, securityScore: null })).toBe(false);
        expect(passesSecurityBar({ ...NO_RISK, honeypotFlag: false, buyTaxPct: null, sellTaxPct: null, securityScore: 29 })).toBe(false);
        expect(passesSecurityBar({ ...NO_RISK, snipersPct: 90, honeypotFlag: false, buyTaxPct: null, sellTaxPct: null, securityScore: null })).toBe(false);
    });
});

describe("contract authority flags", () => {
    /**
     * Mint authority and freeze authority — the two checks every Solana sniper
     * bot runs first, verified against fdundjer/solana-sniper-bot's real filter
     * set (CHECK_IF_MINT_IS_RENOUNCED / CHECK_IF_FREEZABLE) rather than a
     * description of it.
     *
     * Mobula has always returned both and the gate ignored them, so these
     * assertions are the difference between paying for the fields and using
     * them.
     */
    const base = { ...NO_RISK, honeypotFlag: false, buyTaxPct: null, sellTaxPct: null, securityScore: null };

    test("a live mint authority fails — the deployer can print unlimited supply", () => {
        expect(passesSecurityBar({ ...base, noMintAuthority: false })).toBe(false);
    });

    test("a renounced mint passes", () => {
        expect(passesSecurityBar({ ...base, noMintAuthority: true })).toBe(true);
    });

    test("freezable fails — you can buy and then not be allowed to sell", () => {
        expect(passesSecurityBar({ ...base, isFreezable: true })).toBe(false);
    });

    test("not freezable passes", () => {
        expect(passesSecurityBar({ ...base, isFreezable: false })).toBe(true);
    });

    test("NULL KEEPS PASSING — no data is not the same as dangerous", () => {
        // The whole module is fail-open: a brand-new coin reports nothing, and
        // gating on absence would hide exactly the coins the feed is for. This
        // is why the checks compare against false/true rather than truthily.
        expect(passesSecurityBar({ ...base, noMintAuthority: null, isFreezable: null })).toBe(true);
        expect(passesSecurityBar(base)).toBe(true);
    });

    test("either flag alone is enough to fail", () => {
        expect(passesSecurityBar({ ...base, noMintAuthority: false, isFreezable: false })).toBe(false);
        expect(passesSecurityBar({ ...base, noMintAuthority: true, isFreezable: true })).toBe(false);
    });
});

describe("hide risky filter", () => {
    test("drops flagged rows only when the toggle is on", () => {
        const safe = tok({ id: "s" });
        const risky = tok({ id: "r", risky: true });
        expect(applyMemescopeFilters([safe, risky], NO_FILTERS)).toHaveLength(2);
        const out = applyMemescopeFilters([safe, risky], { ...NO_FILTERS, hideRisky: true });
        expect(out.map((t) => t.id)).toEqual(["s"]);
        expect(filtersActive({ ...NO_FILTERS, hideRisky: true })).toBe(true);
        expect(filtersActive(NO_FILTERS)).toBe(false);
    });
});
