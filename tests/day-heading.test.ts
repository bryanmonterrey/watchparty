import { describe, expect, test } from "bun:test";

import { formatDayHeading, isSameCalendarDay, ordinal } from "@/lib/chat/day-heading";

/**
 * `now` is injected throughout. A "Today" label is time-dependent by nature —
 * the same timestamp is Today now and Yesterday tomorrow — so a test that read
 * the real clock would pass all day and fail overnight, which is the worst
 * possible failure schedule.
 */

const NOW = new Date("2026-08-10T12:00:00.000Z");
const at = (iso: string) => new Date(iso);

describe("ordinal", () => {
    test("the ordinary cases", () => {
        expect([1, 2, 3, 4, 5].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "5th"]);
        expect([21, 22, 23, 31].map(ordinal)).toEqual(["21st", "22nd", "23rd", "31st"]);
    });

    test("11, 12 and 13 are the exceptions, and they are always the bug", () => {
        // A naive `n % 10` gives 11st / 12nd / 13th.
        expect([11, 12, 13].map(ordinal)).toEqual(["11th", "12th", "13th"]);
    });
});

describe("formatDayHeading", () => {
    test("today and yesterday", () => {
        expect(formatDayHeading(at("2026-08-10T09:00:00Z"), NOW)).toBe("Today");
        expect(formatDayHeading(at("2026-08-09T23:59:00Z"), NOW)).toBe("Yesterday");
    });

    test("boundaries are CALENDAR days, not 24-hour windows", () => {
        // One minute before midnight is Yesterday even though it is barely 12
        // hours ago; 25 hours ago can still be Yesterday. Elapsed time is the
        // wrong unit and is what a naive diff would use.
        expect(formatDayHeading(at("2026-08-09T11:00:00Z"), NOW)).toBe("Yesterday");
    });

    test("older days get weekday + ordinal, no year in the current one", () => {
        expect(formatDayHeading(at("2026-08-03T12:00:00Z"), NOW)).toBe("Monday, August 3rd");
    });

    test("a prior year earns its year back", () => {
        expect(formatDayHeading(at("2025-12-25T12:00:00Z"), NOW)).toBe("Thursday, December 25th, 2025");
    });

    test("a future date does not claim to be Today", () => {
        expect(formatDayHeading(at("2026-08-11T12:00:00Z"), NOW)).not.toBe("Today");
    });

    test("garbage in, empty string out — never 'Invalid Date' in the UI", () => {
        expect(formatDayHeading("not a date", NOW)).toBe("");
        expect(formatDayHeading(NaN, NOW)).toBe("");
    });

    test("accepts Date, ISO string and epoch ms alike", () => {
        const iso = "2026-08-10T09:00:00.000Z";
        expect(formatDayHeading(iso, NOW)).toBe("Today");
        expect(formatDayHeading(new Date(iso).getTime(), NOW)).toBe("Today");
    });
});

describe("isSameCalendarDay", () => {
    test("same day, different hours", () => {
        expect(isSameCalendarDay("2026-08-10T00:01:00Z", "2026-08-10T23:59:00Z")).toBe(true);
    });

    test("across midnight is not the same day", () => {
        expect(isSameCalendarDay("2026-08-09T23:59:00Z", "2026-08-10T00:01:00Z")).toBe(false);
    });

    test("an unparseable side is never 'same'", () => {
        expect(isSameCalendarDay("nope", "2026-08-10T00:00:00Z")).toBe(false);
    });
});
