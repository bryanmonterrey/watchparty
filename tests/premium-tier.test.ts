import { describe, expect, test } from "bun:test";

import { meetsTier } from "@/lib/premium/tiers";

/**
 * `meetsTier` decides whether a held plan satisfies a required one.
 *
 * It is tested because the failure is invisible. A too-permissive answer shows
 * a paid feature to someone who didn't buy that plan, and nothing about the UI
 * looks wrong — which is exactly how the original shipped: `tier` was accepted,
 * documented as a requirement, and only ever used to pick a label, so the check
 * underneath was a bare `entitled` and every paying user cleared every gate.
 *
 * ⚠️ This is UX only. The real gate is server-side
 * (`server/lib/premium-entitlement.ts`); these assertions are about not lying
 * to the user, not about authorization.
 */

describe("meetsTier", () => {
    test("no requirement means any entitlement clears", () => {
        expect(meetsTier("basic", undefined)).toBe(true);
        expect(meetsTier("biz_custom", undefined)).toBe(true);
        // Even a null tier: `entitled` is the caller's separate check, and an
        // entitled user with an unreadable tierKey should not be locked out.
        expect(meetsTier(null, undefined)).toBe(true);
    });

    test("no plan never clears a specific requirement", () => {
        expect(meetsTier(null, "basic")).toBe(false);
        expect(meetsTier(null, "biz_basic")).toBe(false);
    });

    test("individual ladder is ordered", () => {
        expect(meetsTier("basic", "basic")).toBe(true);
        expect(meetsTier("premium", "basic")).toBe(true);
        // The regression that mattered: the cheaper plan must NOT clear the
        // dearer one.
        expect(meetsTier("basic", "premium")).toBe(false);
        expect(meetsTier("premium", "premium")).toBe(true);
    });

    test("business ladder is ordered", () => {
        expect(meetsTier("biz_basic", "biz_basic")).toBe(true);
        expect(meetsTier("biz_pro", "biz_basic")).toBe(true);
        expect(meetsTier("biz_custom", "biz_pro")).toBe(true);
        expect(meetsTier("biz_basic", "biz_pro")).toBe(false);
        expect(meetsTier("biz_pro", "biz_custom")).toBe(false);
    });

    test("business clears an individual requirement, never the reverse", () => {
        expect(meetsTier("biz_basic", "premium")).toBe(true);
        expect(meetsTier("biz_custom", "basic")).toBe(true);
        // An individual plan must not unlock business-tier features.
        expect(meetsTier("premium", "biz_basic")).toBe(false);
        expect(meetsTier("basic", "biz_custom")).toBe(false);
    });

    test("an unknown key refuses rather than guessing", () => {
        // Adding a tier without placing it on a ladder should fail CLOSED. The
        // opposite default would silently open every gate that names it.
        expect(meetsTier("premium", "not_a_tier" as never)).toBe(false);
        expect(meetsTier("not_a_tier" as never, "premium")).toBe(false);
    });
});
