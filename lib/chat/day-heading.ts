/**
 * The label on a chat day divider.
 *
 * One formatter for every chat surface. Community chat rendered a bare
 * `toLocaleDateString` ("August 9, 2026"), DMs had their own Today/Yesterday
 * helper, and stream chat had nothing — three answers to one question, drifting
 * independently.
 *
 * Shape is buzz's (`features/messages/lib/dateFormatters.ts`): **Today**,
 * **Yesterday**, then a weekday and an ordinal date, with the year appended only
 * when it isn't the current one. The weekday is the useful part — "Monday, March
 * 31st" tells you where you are in a week at a glance, which is what you're
 * actually asking when you scroll back through a channel; "March 31, 2026" makes
 * you work it out.
 *
 * ⚠️ Time-dependent by nature: the same timestamp is "Today" now and "Yesterday"
 * tomorrow. That makes it unsafe to render on the server and hydrate on the
 * client — the exact bug found in `TokenHeader`'s `formatDistanceToNow`, which
 * throws React #418 on the legacy coin page. Every caller here is inside a
 * client component whose data arrives from a client query, so nothing is
 * server-rendered. Keep it that way.
 */

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long" });
const MONTH = new Intl.DateTimeFormat("en-US", { month: "long" });

/** 1st, 2nd, 3rd, 4th … and the 11th/12th/13th exceptions. */
export function ordinal(day: number): string {
    const rem100 = day % 100;
    if (rem100 >= 11 && rem100 <= 13) return `${day}th`;
    switch (day % 10) {
        case 1: return `${day}st`;
        case 2: return `${day}nd`;
        case 3: return `${day}rd`;
        default: return `${day}th`;
    }
}

/** Midnight-aligned day difference — calendar days, not elapsed hours. */
function daysBetween(a: Date, b: Date): number {
    const da = new Date(a.getFullYear(), a.getMonth(), a.getDate());
    const db = new Date(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/**
 * @param value  a Date, ISO string, or epoch ms
 * @param now    injectable so the "Today" boundary is testable rather than
 *               whatever the clock says when the suite runs
 */
export function formatDayHeading(value: Date | string | number, now: Date = new Date()): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const diff = daysBetween(date, now);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";

    const base = `${WEEKDAY.format(date)}, ${MONTH.format(date)} ${ordinal(date.getDate())}`;
    // The year only earns its space once it stops being obvious.
    return date.getFullYear() === now.getFullYear() ? base : `${base}, ${date.getFullYear()}`;
}

/** Same calendar day? The predicate every divider decision reduces to. */
export function isSameCalendarDay(a: Date | string | number, b: Date | string | number): boolean {
    const da = a instanceof Date ? a : new Date(a);
    const db = b instanceof Date ? b : new Date(b);
    if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
    return da.toDateString() === db.toDateString();
}
