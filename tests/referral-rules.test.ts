import { describe, expect, test } from "bun:test";
import {
    APPLY_WINDOW_DAYS,
    applicantRejection,
    canClaimUsernameSlug,
    isWithinApplyWindow,
    linkSlugFor,
    normalizeRefInput,
    pairRejection,
    resolveReferrer,
} from "../lib/referral/rules";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 3);

describe("normalizeRefInput", () => {
    test("trims, strips a leading @, keeps case", () => {
        expect(normalizeRefInput("  @Alice ")).toBe("Alice");
        expect(normalizeRefInput("bry")).toBe("bry");
    });
    test("rejects empty / too short", () => {
        expect(normalizeRefInput("")).toBeNull();
        expect(normalizeRefInput(null)).toBeNull();
        expect(normalizeRefInput("@")).toBeNull();
        expect(normalizeRefInput(" a ")).toBeNull();
    });
    test("clamps to 40 chars", () => {
        expect(normalizeRefInput("x".repeat(80))!.length).toBe(40);
    });
});

describe("linkSlugFor", () => {
    test("slug wins, code is the fallback", () => {
        expect(linkSlugFor({ referralSlug: "alice", referralCode: "AB12CD" })).toBe("alice");
        expect(linkSlugFor({ referralSlug: null, referralCode: "AB12CD" })).toBe("AB12CD");
        expect(linkSlugFor({ referralSlug: null, referralCode: null })).toBeNull();
    });
});

describe("isWithinApplyWindow", () => {
    test("inside / on / past the window", () => {
        expect(isWithinApplyWindow(new Date(NOW - 1 * DAY), NOW)).toBe(true);
        expect(isWithinApplyWindow(new Date(NOW - APPLY_WINDOW_DAYS * DAY), NOW)).toBe(true);
        expect(isWithinApplyWindow(new Date(NOW - (APPLY_WINDOW_DAYS + 1) * DAY), NOW)).toBe(false);
    });
    test("unknown join date does not lock out", () => {
        expect(isWithinApplyWindow(null, NOW)).toBe(true);
    });
});

describe("resolveReferrer", () => {
    function lookups(table: { slug?: Record<string, string>; username?: Record<string, string>; code?: Record<string, string> }) {
        const calls: string[] = [];
        return {
            calls,
            l: {
                bySlug: async (s: string) => { calls.push(`slug:${s}`); return table.slug?.[s] ?? null; },
                byUsername: async (s: string) => { calls.push(`user:${s}`); return table.username?.[s] ?? null; },
                byCode: async (s: string) => { calls.push(`code:${s}`); return table.code?.[s] ?? null; },
            },
        };
    }

    test("slug beats current username holder (rename + re-register cannot hijack)", async () => {
        const { l } = lookups({ slug: { alice: "ALICE" }, username: { alice: "HANK" } });
        expect(await resolveReferrer("Alice", l)).toBe("ALICE");
    });

    test("username beats a code that spells the same thing", async () => {
        const { l } = lookups({ username: { abc123: "USER" }, code: { ABC123: "OTHER" } });
        expect(await resolveReferrer("abc123", l)).toBe("USER");
    });

    test("lookups receive lower-cased slug/username and upper-cased code", async () => {
        const { l, calls } = lookups({ code: { AB12CD: "X" } });
        expect(await resolveReferrer("ab12cd", l)).toBe("X");
        expect(calls).toEqual(["slug:ab12cd", "user:ab12cd", "code:AB12CD"]);
    });

    test("code lookup is skipped when the input cannot be a code", async () => {
        const { l, calls } = lookups({});
        expect(await resolveReferrer("not-a-code", l)).toBeNull();
        expect(calls).toEqual(["slug:not-a-code", "user:not-a-code"]);
    });

    test("mixed-case username resolves (6 live accounts have capitals)", async () => {
        const { l } = lookups({ username: { bry: "B" } });
        expect(await resolveReferrer("Bry", l)).toBe("B");
    });
});

describe("applicantRejection", () => {
    const fresh = { id: "me", referredBy: null, createdAt: new Date(NOW - 2 * DAY), isBot: false };
    test("fresh account is eligible", () => {
        expect(applicantRejection(fresh, NOW)).toBeNull();
    });
    test("already referred", () => {
        expect(applicantRejection({ ...fresh, referredBy: "someone" }, NOW)).toBe("already_referred");
    });
    test("window closed", () => {
        expect(applicantRejection({ ...fresh, createdAt: new Date(NOW - 45 * DAY) }, NOW)).toBe("window_closed");
    });
    test("bots cannot be referred", () => {
        expect(applicantRejection({ ...fresh, isBot: true }, NOW)).toBe("bot");
    });
});

describe("pairRejection", () => {
    const me = { id: "me", referredBy: null, createdAt: new Date(NOW), isBot: false };
    test("ok pair", () => {
        expect(pairRejection(me, { id: "ref", referredBy: null, isBot: false })).toBeNull();
    });
    test("self", () => {
        expect(pairRejection(me, { id: "me", referredBy: null, isBot: false })).toBe("self");
    });
    test("mutual: the referrer was referred by me", () => {
        expect(pairRejection(me, { id: "ref", referredBy: "me", isBot: false })).toBe("mutual");
    });
    test("bot referrer", () => {
        expect(pairRejection(me, { id: "ref", referredBy: null, isBot: true })).toBe("bot");
    });
});

describe("canClaimUsernameSlug", () => {
    test("no slug yet, name free → claimable", () => {
        expect(canClaimUsernameSlug({ username: "alice", referralSlug: null, usernameTakenByOtherSlug: false })).toBe(true);
    });
    test("slug already equals username (any case) → nothing to do", () => {
        expect(canClaimUsernameSlug({ username: "Alice", referralSlug: "alice", usernameTakenByOtherSlug: false })).toBe(false);
    });
    test("renamed → offer the new name", () => {
        expect(canClaimUsernameSlug({ username: "alice2", referralSlug: "alice", usernameTakenByOtherSlug: false })).toBe(true);
    });
    test("someone else's link already uses the name → not claimable", () => {
        expect(canClaimUsernameSlug({ username: "alice", referralSlug: null, usernameTakenByOtherSlug: true })).toBe(false);
    });
    test("no username → nothing to claim", () => {
        expect(canClaimUsernameSlug({ username: null, referralSlug: null, usernameTakenByOtherSlug: false })).toBe(false);
    });
});
