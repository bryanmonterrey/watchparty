import { describe, expect, test } from "bun:test";

import { activeTickerQuery, reconcileTags } from "@/components/tags/use-ticker-picker";

/**
 * When the `$` menu opens decides whether tagging feels native or intrusive.
 * Opening on a bare `$` would list the whole board every time somebody types a
 * price; failing to close it would leave a menu over the composer.
 */

describe("activeTickerQuery", () => {
    const at = (s: string) => activeTickerQuery(s, s.length);

    test("opens once there is a character after the $", () => {
        expect(at("gm $b")).toEqual({ q: "b", start: 3 });
        expect(at("gm $bon")).toEqual({ q: "bon", start: 3 });
    });

    test("a bare $ opens nothing — that would list the entire board", () => {
        expect(at("gm $")).toBeNull();
    });

    test("whitespace closes it", () => {
        expect(at("gm $bonk ")).toBeNull();
    });

    test("only the token the CARET is in", () => {
        // An earlier, already-decided tag must not re-open the menu.
        const text = "gm $WIF and now $bo";
        expect(activeTickerQuery(text, text.length)).toEqual({ q: "bo", start: 16 });
    });

    test("the $ must open a word, matching the extractor", () => {
        expect(at("costs US$5")).toBeNull();
        expect(at("a$b")).toBeNull();
    });

    test("digits are fine — $4CHAN is a ticker", () => {
        expect(at("gm $4c")).toEqual({ q: "4c", start: 3 });
    });

    test("punctuation ends the token", () => {
        expect(at("gm $bonk!")).toBeNull();
    });

    test("no $ at all", () => {
        expect(at("just a normal post")).toBeNull();
    });

    test("caret BEFORE the $ sees nothing", () => {
        expect(activeTickerQuery("gm $bonk", 2)).toBeNull();
    });
});

describe("reconcileTags", () => {
    const wif = { network: "solana", tokenAddress: "abc", symbol: "WIF" };
    const bonk = { network: "solana", tokenAddress: "def", symbol: "BONK" };

    test("drops a tag whose ticker was deleted from the text", () => {
        // Picked both, then removed $BONK before posting — storing it would put
        // an avatar on BONK's chart for a post that never mentions it.
        expect(reconcileTags("gm $WIF", [wif, bonk])).toEqual([wif]);
    });

    test("keeps what is still written, case-insensitively", () => {
        expect(reconcileTags("gm $wif and $bonk", [wif, bonk])).toEqual([wif, bonk]);
    });

    test("empty text keeps nothing", () => {
        expect(reconcileTags("", [wif])).toEqual([]);
    });
});
