import { describe, expect, test } from "bun:test";
import { periodKeyFor, periodResetAt } from "../lib/quests";

// periodKey scopes quest progress to its window — a wrong key either resets
// quests mid-window or never resets them. ISO-week math has famous edge cases
// around New Year; pin them.

describe("periodKeyFor", () => {
    test("daily is the UTC date", () => {
        expect(periodKeyFor("daily", new Date("2026-07-19T23:59:59Z"))).toBe("2026-07-19");
        expect(periodKeyFor("daily", new Date("2026-07-19T00:00:00Z"))).toBe("2026-07-19");
        expect(periodKeyFor("daily", new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-31");
    });

    test("weekly ISO edges around New Year", () => {
        // 2026-01-01 is a Thursday → ISO week 1 of 2026.
        expect(periodKeyFor("weekly", new Date("2026-01-01T12:00:00Z"))).toBe("2026-W01");
        // 2027-01-01 is a Friday → still ISO week 53 of 2026.
        expect(periodKeyFor("weekly", new Date("2027-01-01T12:00:00Z"))).toBe("2026-W53");
        // 2024-12-30 is a Monday → ISO week 1 of 2025.
        expect(periodKeyFor("weekly", new Date("2024-12-30T12:00:00Z"))).toBe("2025-W01");
    });

    test("weekly window is stable Monday through Sunday", () => {
        // 2026-07-13 (Mon) … 2026-07-19 (Sun) are all the same ISO week.
        const key = periodKeyFor("weekly", new Date("2026-07-13T00:00:00Z"));
        for (let d = 13; d <= 19; d++) {
            expect(periodKeyFor("weekly", new Date(`2026-07-${d}T12:00:00Z`))).toBe(key);
        }
        expect(periodKeyFor("weekly", new Date("2026-07-20T00:00:00Z"))).not.toBe(key);
    });
});

describe("periodResetAt", () => {
    test("daily resets at the next UTC midnight", () => {
        const reset = periodResetAt("daily", new Date("2026-07-19T15:30:00Z"));
        expect(reset.toISOString()).toBe("2026-07-20T00:00:00.000Z");
    });

    test("weekly resets on the next Monday UTC midnight", () => {
        // Sunday 2026-07-19 → Monday 2026-07-20.
        expect(periodResetAt("weekly", new Date("2026-07-19T15:30:00Z")).toISOString()).toBe("2026-07-20T00:00:00.000Z");
        // Monday 2026-07-13 → next Monday 2026-07-20 (not same-day).
        expect(periodResetAt("weekly", new Date("2026-07-13T09:00:00Z")).toISOString()).toBe("2026-07-20T00:00:00.000Z");
    });

    test("reset always lands in a different period key", () => {
        for (const period of ["daily", "weekly"] as const) {
            const now = new Date("2026-07-19T15:30:00Z");
            expect(periodKeyFor(period, periodResetAt(period, now))).not.toBe(periodKeyFor(period, now));
        }
    });
});
