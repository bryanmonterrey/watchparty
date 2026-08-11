import { afterEach, describe, expect, test } from "bun:test";

import { sameAddressSet, webhookIsCurrent } from "@/lib/helius/webhook-edit";

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

describe("webhookIsCurrent", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => {
        globalThis.fetch = realFetch;
    });

    const serve = (body: unknown, ok = true) => {
        globalThis.fetch = (async () =>
            ({ ok, json: async () => body }) as unknown as Response) as typeof fetch;
    };

    test("matching addresses and types on a live webhook is current", async () => {
        serve({ active: true, accountAddresses: ["b", "a"], transactionTypes: ["SWAP"] });
        expect(await webhookIsCurrent("k", "id", ["a", "b"], ["SWAP"])).toBe(true);
    });

    test("a DISABLED webhook is never current, however well it matches", async () => {
        // Helius auto-disables an endpoint that fails too often. A disabled
        // webhook still reports the addresses it was configured with, so a
        // comparison that ignored `active` would skip the write and leave it
        // dead — permanently, since every later run reaches the same verdict.
        serve({ active: false, accountAddresses: ["a", "b"], transactionTypes: ["SWAP"] });
        expect(await webhookIsCurrent("k", "id", ["a", "b"], ["SWAP"])).toBe(false);
    });

    test("an ABSENT active field does not read as disabled", async () => {
        // Otherwise the guard never skips anything and the 100-credit charge
        // comes straight back.
        serve({ accountAddresses: ["a"], transactionTypes: ["SWAP"] });
        expect(await webhookIsCurrent("k", "id", ["a"], ["SWAP"])).toBe(true);
    });

    test("a changed mode is a change", async () => {
        serve({ active: true, accountAddresses: ["a"], transactionTypes: ["ANY"] });
        expect(await webhookIsCurrent("k", "id", ["a"], ["SWAP"])).toBe(false);
    });

    test("a non-ok response or a throw means WRITE", async () => {
        serve({}, false);
        expect(await webhookIsCurrent("k", "id", ["a"], ["SWAP"])).toBe(false);

        globalThis.fetch = (async () => {
            throw new Error("network");
        }) as typeof fetch;
        expect(await webhookIsCurrent("k", "id", ["a"], ["SWAP"])).toBe(false);
    });
});
