import { describe, expect, test } from "bun:test";

import { extractTags, postTagsTicker } from "@/lib/tags/extract";

/**
 * A Tag puts somebody's avatar on a coin's chart at a price and a moment, so a
 * false positive is not a cosmetic bug — it attributes words to a coin the
 * author never mentioned. These cases are mostly about REFUSING.
 */

describe("extractTags", () => {
    test("the ordinary case", () => {
        expect(extractTags("buying $CASHCAT here")).toEqual([{ raw: "CASHCAT", key: "cashcat" }]);
    });

    test("money is not a ticker", () => {
        // The single most common `$` in this app's text by a wide margin.
        for (const s of ["worth $100", "up $5", "$1.5m volume", "paid $20 for it"]) {
            expect(extractTags(s)).toEqual([]);
        }
    });

    test("digit-leading tickers are real tickers", () => {
        // $4CHAN is a coin. Requiring a leading letter threw these away.
        expect(extractTags("$4CHAN")).toEqual([{ raw: "4CHAN", key: "4chan" }]);
        expect(extractTags("$C4")).toEqual([{ raw: "C4", key: "c4" }]);
        expect(extractTags("$0x")).toEqual([{ raw: "0x", key: "0x" }]);
    });

    test("money SHORTHAND is still money, even with a letter in it", () => {
        for (const s of ["$5m", "$10k", "$1.5b", "$2T"]) expect(extractTags(s)).toEqual([]);
    });

    test("a ticker needs at least one letter", () => {
        expect(extractTags("$100")).toEqual([]);
        expect(extractTags("$4444")).toEqual([]);
    });

    test("mid-word dollars are not tags", () => {
        // US$5 and a$b — the `$` has to open a word.
        expect(extractTags("costs US$5")).toEqual([]);
        expect(extractTags("a$b")).toEqual([]);
    });

    test("a bare or doubled $ is nothing", () => {
        expect(extractTags("$")).toEqual([]);
        expect(extractTags("$$ $$$")).toEqual([]);
    });

    test("one ticker twice is ONE tag — repetition is emphasis", () => {
        expect(extractTags("$WIF to the moon, $wif forever")).toEqual([{ raw: "WIF", key: "wif" }]);
    });

    test("several distinct tickers, in the order written", () => {
        expect(extractTags("$BONK then $WIF").map((t) => t.key)).toEqual(["bonk", "wif"]);
    });

    test("case is kept for display and folded for lookup", () => {
        expect(extractTags("$CashCat")).toEqual([{ raw: "CashCat", key: "cashcat" }]);
    });

    test("length bounds: 2 to 16 characters", () => {
        expect(extractTags("$A")).toEqual([]);              // one char
        expect(extractTags("$AB")[0]?.key).toBe("ab");      // two is the floor
        expect(extractTags("$" + "A".repeat(16))[0]?.key).toBe("a".repeat(16));
        expect(extractTags("$" + "A".repeat(17))).toEqual([]); // over the ceiling
    });

    test("empty input is empty output, never a throw", () => {
        for (const v of [null, undefined, ""]) expect(extractTags(v)).toEqual([]);
    });
});

describe("postTagsTicker", () => {
    test("matches with or without the leading $ on the symbol", () => {
        expect(postTagsTicker("gm $BONK", "BONK")).toBe(true);
        expect(postTagsTicker("gm $BONK", "$BONK")).toBe(true);
        expect(postTagsTicker("gm $BONK", "bonk")).toBe(true);
    });

    test("a post about another coin does not tag this one", () => {
        expect(postTagsTicker("gm $WIF", "BONK")).toBe(false);
    });

    test("the ticker as a plain word is NOT a tag", () => {
        // "bonk" appears constantly in ordinary text; only the $ form counts.
        expect(postTagsTicker("bonk is up today", "BONK")).toBe(false);
    });
});
