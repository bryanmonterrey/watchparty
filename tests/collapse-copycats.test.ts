import { describe, expect, test } from "bun:test";
import { collapseCopycats, type Copycat } from "@/lib/coins/collapse-copycats";

// The case this encodes is real, from the live board on 2026-08-17. Four rows
// shared the identity "Z | Gen Z", and picking the survivor by VOLUME chose a
// coin with 28 cents of liquidity doing $10.8M a day — which is not a market,
// it is a wash-trading loop. The genuine one was on another chain with far less
// volume and four orders of magnitude more depth.
//
// Volume is nearly free to manufacture; liquidity is capital that has to sit in
// the pool. So when the two disagree about which twin is real, liquidity wins.

const row = (o: Partial<Copycat> & { symbol: string }): Copycat => ({
    name: "Gen Z",
    volume: 0,
    marketCap: 0,
    liquidity: null,
    ...o,
});

describe("collapseCopycats", () => {
    test("keeps the liquid twin over the higher-volume wash trade", () => {
        const board: Copycat[] = [
            row({ symbol: "Z", volume: 10_822_562, marketCap: 427_199, liquidity: 0.276 }),
            row({ symbol: "Z", volume: 9_342_358, marketCap: 324_437, liquidity: 0.29 }),
            row({ symbol: "Z", volume: 6_981_299, marketCap: 226_200, liquidity: 0.021 }),
            row({ symbol: "Z", volume: 2_026_942, marketCap: 2_691, liquidity: 2_486 }),
        ];

        const kept = collapseCopycats(board);
        expect(kept).toHaveLength(1);
        // The one with real depth, despite having the LEAST volume of the four.
        expect(kept[0].liquidity).toBe(2_486);
    });

    test("volume still decides when neither twin has real liquidity", () => {
        // Both unmeasured: liquidity is null until the per-coin screen runs, and
        // a new coin must not lose merely for being unscreened.
        const kept = collapseCopycats([
            row({ symbol: "Z", volume: 100 }),
            row({ symbol: "Z", volume: 900 }),
        ]);
        expect(kept).toHaveLength(1);
        expect(kept[0].volume).toBe(900);
    });

    test("an unmeasured row does not lose to a measured-but-tiny one", () => {
        // The floor is what makes liquidity decisive, not the mere presence of
        // a number — otherwise screening a coin and finding dust would promote
        // it over every coin not yet screened.
        const kept = collapseCopycats([
            row({ symbol: "Z", volume: 5_000_000, liquidity: null }),
            row({ symbol: "Z", volume: 10, liquidity: 5 }),
        ]);
        expect(kept).toHaveLength(1);
        expect(kept[0].volume).toBe(5_000_000);
    });

    test("identity is symbol AND name, so a shared ticker survives", () => {
        // Two real coins can share a ticker; collapsing on symbol alone would
        // hide one of them.
        const kept = collapseCopycats([
            row({ symbol: "XST", name: "xst", volume: 10 }),
            row({ symbol: "XST", name: "xsolutai", volume: 5 }),
        ]);
        expect(kept).toHaveLength(2);
    });

    test("in-house rows still beat external ones regardless of liquidity", () => {
        // Unchanged precedence: an in-house launch carries creator, live and
        // curve state that an external row simply does not have.
        const kept = collapseCopycats([
            row({ symbol: "Z", external: true, volume: 1_000_000, liquidity: 50_000 }),
            row({ symbol: "Z", external: false, volume: 1, liquidity: null }),
        ]);
        expect(kept).toHaveLength(1);
        expect(kept[0].external).toBe(false);
    });

    test("survivors keep their original order", () => {
        // The caller has already sorted; re-emitting from the Map would quietly
        // reorder the board.
        const kept = collapseCopycats([
            row({ symbol: "A", name: "a", volume: 3 }),
            row({ symbol: "B", name: "b", volume: 2 }),
            row({ symbol: "C", name: "c", volume: 1 }),
        ]);
        expect(kept.map((k) => k.symbol)).toEqual(["A", "B", "C"]);
    });
});
