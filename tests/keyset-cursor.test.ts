import { describe, expect, test } from "bun:test";

import { encodeKeysetCursor, parseKeysetCursor } from "@/lib/pagination/keyset";

/**
 * The property under test is one sentence: a cursor must be able to resume
 * INSIDE a run of tied rows.
 *
 * `post.searchPosts` shipped a value-only cursor and lost 80 of 120 results
 * because `baseScore` is `real().default(0)` — 100 rows tied at zero, and
 * `WHERE score < 0` matches nothing. These tests pin the encode/parse half; the
 * SQL half (`col < v OR (col = v AND id > id)`) lives in the procedures and was
 * verified against a seeded database.
 */

const ID = "df453c85-bcc7-4ef8-9049-79fac925beb3";

describe("encodeKeysetCursor", () => {
    test("carries the id alongside the value — that is the whole point", () => {
        expect(encodeKeysetCursor(0, ID)).toBe(`0|${ID}`);
    });

    test("normalises a Date to ISO so the wire format is stable", () => {
        const d = new Date(Date.UTC(2026, 7, 10, 12, 0, 0));
        expect(encodeKeysetCursor(d, ID)).toBe(`2026-08-10T12:00:00.000Z|${ID}`);
    });

    test("zero and negative values survive — they are ordinary scores, not absent ones", () => {
        // A falsy-check on the value would drop exactly the rows that tie most.
        expect(parseKeysetCursor(encodeKeysetCursor(0, ID), "number")).toEqual({ value: 0, id: ID });
        expect(parseKeysetCursor(encodeKeysetCursor(-2.5, ID), "number")).toEqual({ value: -2.5, id: ID });
    });
});

describe("parseKeysetCursor", () => {
    test("round-trips numbers and dates", () => {
        expect(parseKeysetCursor(encodeKeysetCursor(12.5, ID), "number")).toEqual({ value: 12.5, id: ID });
        const d = new Date(Date.UTC(2026, 7, 10, 12));
        const back = parseKeysetCursor(encodeKeysetCursor(d, ID), "date")!;
        expect(back.value).toBeInstanceOf(Date);
        expect(back.value.getTime()).toBe(d.getTime());
        expect(back.id).toBe(ID);
    });

    test("splits on the LAST separator, so a value containing one still parses", () => {
        // An id is a uuid and can never contain the separator, so the last one
        // is always the real boundary. This is the case my own test harness got
        // wrong — it split on the last field of `rows|cursor` and handed the
        // server a bare uuid.
        const weird = parseKeysetCursor(`a|b|c|${ID}`, "string");
        expect(weird).toEqual({ value: "a|b|c", id: ID });
    });

    test("a legacy value-only cursor parses as null, not a throw", () => {
        // Clients mid-session across a deploy still hold the old format. null
        // means "no cursor filter" — one repeated page, which beats erroring at
        // someone who is just scrolling.
        expect(parseKeysetCursor("0", "number")).toBeNull();
        expect(parseKeysetCursor("2026-08-10T12:00:00.000Z", "date")).toBeNull();
    });

    test("refuses junk rather than producing a cursor that filters nothing", () => {
        expect(parseKeysetCursor(undefined, "number")).toBeNull();
        expect(parseKeysetCursor(null, "number")).toBeNull();
        expect(parseKeysetCursor("", "number")).toBeNull();
        // A uuid where a number belongs — Number(uuid) is NaN.
        expect(parseKeysetCursor(`${ID}|${ID}`, "number")).toBeNull();
        expect(parseKeysetCursor(`not-a-date|${ID}`, "date")).toBeNull();
        // Missing halves.
        expect(parseKeysetCursor(`|${ID}`, "number")).toBeNull();
        expect(parseKeysetCursor(`5|`, "number")).toBeNull();
    });
});
