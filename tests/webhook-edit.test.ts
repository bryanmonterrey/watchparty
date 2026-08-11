import { describe, expect, test } from "bun:test";

import { sameAddressSet } from "@/lib/helius/webhook-edit";

/**
 * Helius charges 100 credits per webhook EDIT and 1 per delivery. Three syncs
 * ran hourly and PUT unconditionally — 7,500 credits/day re-registering
 * payloads that had not changed, on an app with no users. This comparison is
 * the whole saving, so its edge cases are the ones that cost money.
 */

describe("sameAddressSet", () => {
    test("order does not matter", () => {
        // The real reason: selection sorts cheapest-first, so a pool whose
        // txns24h merely ticked up reorders the array without changing what is
        // watched. A positional compare would bill 100 credits for that.
        expect(sameAddressSet(["a", "b", "c"], ["c", "a", "b"])).toBe(true);
    });

    test("a genuine change is still a change", () => {
        expect(sameAddressSet(["a", "b"], ["a", "c"])).toBe(false);
        expect(sameAddressSet(["a"], ["a", "b"])).toBe(false);
        expect(sameAddressSet(["a", "b"], ["a"])).toBe(false);
    });

    test("empty on both sides is unchanged", () => {
        expect(sameAddressSet([], [])).toBe(true);
    });

    test("a missing or malformed current list means WRITE, never skip", () => {
        // Failing to compare must fall to the safe side: a skipped edit leaves
        // a stale registration live, which is the expensive direction — that is
        // how a wide webhook survives and drains a plan in hours.
        expect(sameAddressSet(undefined, [])).toBe(false);
        expect(sameAddressSet(null, ["a"])).toBe(false);
        expect(sameAddressSet("nope", ["a"])).toBe(false);
        expect(sameAddressSet({ 0: "a" }, ["a"])).toBe(false);
    });

    test("duplicates in the current list are not equal to a deduped set", () => {
        // length check catches it before the Set collapses them — otherwise
        // ["a","a"] would look identical to ["a"] and a real edit be skipped.
        expect(sameAddressSet(["a", "a"], ["a"])).toBe(false);
    });
});
