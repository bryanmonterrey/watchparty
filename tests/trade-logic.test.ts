import { describe, expect, test } from "bun:test";
import {
    applyMemescopeFilters,
    filtersActive,
    NO_FILTERS,
    volumeAcceleration,
    turnover,
} from "@/components/trade/memescope-filter-dialog";
import { mobulaChainId, mobulaCoinBlockchain } from "@/lib/coins/mobula";
import { compactCount } from "@/lib/utils";

// Pure trade-surface logic: the memescope filter (what the filter dialog
// applies), the chain-vocabulary maps (three vendors, three vocabularies —
// a wrong mapping silently empties a board), and the count formatter.

const coin = (over: Partial<{ marketCap: number; volume: number; holderCount: number; createdAtMs: number | null }> = {}) => ({
    marketCap: 50_000,
    volume: 10_000,
    holderCount: 100,
    createdAtMs: Date.now() - 60 * 60_000, // 1h old
    ...over,
});

describe("memescope filters", () => {
    test("no filters = identity, and reads as inactive", () => {
        const list = [coin(), coin({ marketCap: 1 })];
        expect(applyMemescopeFilters(list, NO_FILTERS)).toBe(list);
        expect(filtersActive(NO_FILTERS)).toBe(false);
    });

    test("each threshold filters independently", () => {
        const list = [coin(), coin({ marketCap: 500 }), coin({ volume: 10 }), coin({ holderCount: 2 })];
        expect(applyMemescopeFilters(list, { ...NO_FILTERS, minMarketCap: 10_000 })).toHaveLength(3);
        expect(applyMemescopeFilters(list, { ...NO_FILTERS, minVolume: 5_000 })).toHaveLength(3);
        expect(applyMemescopeFilters(list, { ...NO_FILTERS, minHolders: 50 })).toHaveLength(3);
        expect(filtersActive({ ...NO_FILTERS, minHolders: 50 })).toBe(true);
    });

    test("max age drops old coins AND coins with unknown age", () => {
        const fresh = coin();
        const old = coin({ createdAtMs: Date.now() - 48 * 3_600_000 });
        const unknown = coin({ createdAtMs: null });
        const out = applyMemescopeFilters([fresh, old, unknown], { ...NO_FILTERS, maxAgeHours: 24 });
        expect(out).toEqual([fresh]);
    });
});

/**
 * Buy pressure and volume acceleration — the two signals traders actually read
 * off a pair, and both computable from data the sync already stores.
 *
 * The tests below are mostly about REFUSING, because the obvious version of
 * each is wrong in the same way: a ratio over a tiny sample, and a comparison
 * with no baseline, both produce a confident number that means nothing.
 */

const pumping = (over: Partial<{
    buyPercent: number; txCount: number; volume5m: number | null; volume1h: number | null;
}> = {}) => ({
    marketCap: 50_000,
    volume: 10_000,
    holderCount: 100,
    createdAtMs: Date.now() - 60 * 60_000,
    buyPercent: 75,
    txCount: 200,
    volume5m: 5_000,
    volume1h: 12_000,
    ...over,
});

describe("volumeAcceleration", () => {
    test("1.0 means the last 5 minutes match the hour's pace", () => {
        // 1000 * 12 == 12000, exactly one hour's worth at that rate.
        expect(volumeAcceleration({ volume5m: 1_000, volume1h: 12_000 })).toBe(1);
    });

    test("2.0 means twice the pace", () => {
        expect(volumeAcceleration({ volume5m: 2_000, volume1h: 12_000 })).toBe(2);
    });

    test("no baseline means no answer, not zero and not infinity", () => {
        // A missing or zero 1h volume is the newest-coin case. Returning 0
        // would rank it dead last; dividing by it would rank it first. Both are
        // inventions — the honest answer is "unknown".
        expect(volumeAcceleration({ volume5m: 5_000, volume1h: null })).toBeNull();
        expect(volumeAcceleration({ volume5m: 5_000, volume1h: 0 })).toBeNull();
        expect(volumeAcceleration({ volume5m: null, volume1h: 12_000 })).toBeNull();
    });
});

describe("buy pressure filter", () => {
    test("keeps coins above the threshold", () => {
        const out = applyMemescopeFilters([pumping()], { ...NO_FILTERS, minBuyPercent: 60 });
        expect(out).toHaveLength(1);
    });

    test("drops coins below it", () => {
        const out = applyMemescopeFilters([pumping({ buyPercent: 40 })], { ...NO_FILTERS, minBuyPercent: 60 });
        expect(out).toHaveLength(0);
    });

    test("THE TRAP: a perfect ratio on a handful of trades does not pass", () => {
        // One buy, no sells, 100% buys. This is the emptiest possible token and
        // it would top any naive buy-pressure sort.
        const dust = pumping({ buyPercent: 100, txCount: 1 });
        expect(applyMemescopeFilters([dust], { ...NO_FILTERS, minBuyPercent: 60 })).toHaveLength(0);
        // And it is the sample size doing the work, not the ratio.
        expect(applyMemescopeFilters([pumping({ buyPercent: 100, txCount: 200 })], {
            ...NO_FILTERS, minBuyPercent: 60,
        })).toHaveLength(1);
    });

    test("is inert when unset", () => {
        expect(applyMemescopeFilters([pumping({ buyPercent: 1, txCount: 1 })], NO_FILTERS)).toHaveLength(1);
    });
});

describe("turnover", () => {
    /**
     * 24h volume over market cap. Measured median across the live watch list is
     * ~21x, which is why it is worth ranking on: absolute volume cannot tell a
     * $1.2M coin doing 40x from one doing 2x, because it does not know how big
     * the coin is.
     */
    test("expresses activity relative to size", () => {
        expect(turnover({ volume: 10_000, marketCap: 1_000 })).toBe(10);
        expect(turnover({ volume: 500, marketCap: 1_000 })).toBe(0.5);
    });

    test("no market cap means no answer", () => {
        // Not 0 (ranks it last) and not Infinity (ranks it first). Both invent
        // a fact about a coin we have no size for.
        expect(turnover({ volume: 10_000, marketCap: 0 })).toBeNull();
        expect(turnover({ volume: 10_000, marketCap: NaN })).toBeNull();
    });

    test("filters on it, and drops coins it cannot measure", () => {
        const hot = pumping();                                     // 10k vol / 50k mcap = 0.2x
        const spinning = { ...pumping(), volume: 500_000 };         // 10x
        expect(applyMemescopeFilters([hot, spinning], { ...NO_FILTERS, minTurnover: 5 }))
            .toHaveLength(1);
        expect(applyMemescopeFilters([{ ...pumping(), marketCap: 0 }], { ...NO_FILTERS, minTurnover: 5 }))
            .toHaveLength(0);
        expect(filtersActive({ ...NO_FILTERS, minTurnover: 5 })).toBe(true);
    });
});

describe("volume acceleration filter", () => {
    test("keeps coins running hotter than the threshold", () => {
        // 5000 * 12 / 12000 = 5x
        expect(applyMemescopeFilters([pumping()], { ...NO_FILTERS, minVolumeAccel: 2 })).toHaveLength(1);
    });

    test("drops coins that are cooling", () => {
        // 500 * 12 / 12000 = 0.5x
        const cooling = pumping({ volume5m: 500 });
        expect(applyMemescopeFilters([cooling], { ...NO_FILTERS, minVolumeAccel: 2 })).toHaveLength(0);
    });

    test("drops coins with no baseline, on purpose", () => {
        // Mostly the very newest coins. Letting them through would make the
        // field mean "new OR accelerating", which is not what it says.
        const noBaseline = pumping({ volume1h: null });
        expect(applyMemescopeFilters([noBaseline], { ...NO_FILTERS, minVolumeAccel: 2 })).toHaveLength(0);
        // But they are untouched when the filter is off.
        expect(applyMemescopeFilters([noBaseline], NO_FILTERS)).toHaveLength(1);
    });

    test("both new filters register as active", () => {
        expect(filtersActive({ ...NO_FILTERS, minBuyPercent: 60 })).toBe(true);
        expect(filtersActive({ ...NO_FILTERS, minVolumeAccel: 2 })).toBe(true);
    });
});

describe("chain vocabulary maps", () => {
    test("registry ids → Mobula pairs vocabulary", () => {
        // bnb is "bsc" to Mobula — the mapping that 500'd when guessed wrong.
        expect(mobulaCoinBlockchain("bnb")).toBe("bsc");
        expect(mobulaCoinBlockchain("polygon_pos")).toBe("polygon");
        expect(mobulaCoinBlockchain("eth")).toBe("ethereum");
        expect(mobulaCoinBlockchain("solana")).toBe("solana");
        // Unknown chains must be null (skip), never a passthrough guess.
        expect(mobulaCoinBlockchain("robinhood")).toBeNull();
    });

    test("OHLCV chain allowlist", () => {
        expect(mobulaChainId("ETH")).toBe("ethereum");
        expect(mobulaChainId("base")).toBe("base");
        expect(mobulaChainId("dogechain")).toBeNull();
    });
});

describe("compactCount", () => {
    test("boundaries", () => {
        expect(compactCount(999)).toBe("999");
        expect(compactCount(1_000)).toBe("1.0K");
        expect(compactCount(10_000)).toBe("10K");
        expect(compactCount(1_500_000)).toBe("1.5M");
        expect(compactCount(null)).toBe("0");
    });
});
