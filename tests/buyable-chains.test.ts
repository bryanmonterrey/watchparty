import { describe, expect, test } from "bun:test";
import { buyableChainId } from "@/lib/coin-feed/networks";
import { MOBULA_TRENDING_CHAINS } from "@/lib/coin-feed/trending-mobula";
import { getChain } from "@/lib/chains/registry";
import { swapSupport } from "@/lib/chains/swap";

// This file exists because of a bug that looked exactly like working code.
//
// `trending_coins.network` carries TWO slug spaces at once: GeckoTerminal's
// (`eth`, `bsc`, `polygon_pos`) on rows from the GT sweep, and
// MOBULA_TRENDING_CHAINS' (`ethereum`, `bnb`, `polygon`) on rows from the
// Mobula sync. The first version of the map listed only the GT spellings, so
// the majority of the board silently could not be bought — and the chains that
// spell the SAME in both (solana, base, robinhood, hyperevm) kept working,
// which is what hid it. Counted on prod at the time: bnb 144 rows, ethereum
// 92, polygon 60, versus bsc 35, eth 19, polygon_pos 14.
//
// tsc cannot catch a missing key in a Record<string, string> lookup: the miss
// is a valid `undefined`, and "not buyable" is a legitimate answer for most of
// the ~20 chains the board trends. Only a test that knows which chains are
// SUPPOSED to fill can tell the two apart.

describe("buyableChainId", () => {
    test("every chain the Mobula board syncs is buyable", () => {
        // The dominant source. If the board trends it and we hold keys for it,
        // a user looking at that row must be able to buy it.
        for (const chain of MOBULA_TRENDING_CHAINS) {
            expect(buyableChainId(chain)).toBe(chain);
        }
    });

    test("GeckoTerminal spellings resolve to the same registry ids", () => {
        expect(buyableChainId("eth")).toBe("ethereum");
        expect(buyableChainId("bsc")).toBe("bnb");
        expect(buyableChainId("polygon_pos")).toBe("polygon");
    });

    test("both spellings of a chain agree", () => {
        // The specific failure: `bsc` mapped and `bnb` did not, so whether a
        // BNB coin could be bought depended on which sync happened to write it.
        expect(buyableChainId("bsc")).toBe(buyableChainId("bnb"));
        expect(buyableChainId("eth")).toBe(buyableChainId("ethereum"));
        expect(buyableChainId("polygon_pos")).toBe(buyableChainId("polygon"));
    });

    test("every mapped id is a real registry chain that can actually swap", () => {
        // Guards the other direction: a map entry is a PROMISE that the buy
        // dialog can fill this row. Pointing at a chain the registry doesn't
        // know, or one swapSupport refuses, turns "Buy" into a thrown error.
        for (const slug of ["solana", "base", "eth", "bsc", "polygon_pos", "ethereum", "bnb", "polygon", "hyperevm", "robinhood"]) {
            const id = buyableChainId(slug);
            expect(id).not.toBeNull();
            expect(getChain(id!)).toBeDefined();
            expect(swapSupport(id!).supported).toBe(true);
        }
    });

    test("chains we only display are not claimed as buyable", () => {
        // We trend these and hold no keys for them. Returning a chain id here
        // would offer a button that cannot fill.
        for (const slug of ["arbitrum", "avax", "optimism", "ton", "sui-network", "aptos", "tron", "berachain", "blast", "linea", "unichain", "sonic", "abstract"]) {
            expect(buyableChainId(slug)).toBeNull();
        }
    });

    test("an unknown slug is null, not a crash", () => {
        expect(buyableChainId("")).toBeNull();
        expect(buyableChainId("not-a-chain")).toBeNull();
    });
});
