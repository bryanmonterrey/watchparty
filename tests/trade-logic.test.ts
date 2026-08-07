import { describe, expect, test } from "bun:test";
import { applyMemescopeFilters, filtersActive, NO_FILTERS } from "@/components/trade/memescope-filter-dialog";
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
