/**
 * ⚠️ `formatDayDivider` / `isSameDay` moved to `lib/chat/day-heading.ts` as
 * `formatDayHeading` / `isSameCalendarDay`, and every chat surface now shares
 * them. They lived here while DMs were the only list with dividers; community
 * chat had a THIRD implementation inline (a bare toLocaleDateString), which is
 * how the same question ended up with three answers.
 *
 * The shared version also takes an injectable `now`, so the Today/Yesterday
 * boundary is testable instead of depending on when the suite happens to run.
 */
export function formatDayDivider(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();

    // Reset time components for accurate day comparison
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const n = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const diffTime = n.getTime() - d.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
        return 'Today';
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    }
}

// Helper to check if two dates are same day
export function isSameDay(date1: string, date2: string): boolean {
    const d1 = new Date(date1);
    const d2 = new Date(date2);

    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
}

export function formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHour / 24);
    const diffWeeks = Math.floor(diffDays / 7);

    // "Now" for very recent
    if (diffMin < 1) return 'now';

    // "X min ago"
    if (diffMin < 60) return `${diffMin} min ago`;

    // "X hours ago"
    if (diffHour < 24) return `${diffHour}h ago`;

    // "Yesterday"
    // Check if it was strictly yesterday (date difference of 1 day)
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (isSameDay(date.toISOString(), yesterday.toISOString())) {
        return 'Yesterday';
    }

    // "X days ago" (up to 6 days)
    if (diffDays < 7) return `${diffDays}d ago`;

    // If it's this year, show "MMM D" e.g "Dec 21" ?
    // User asked for "mm/dd/yyyy" for long time ago.
    // User image showed "4w", "41w".
    // User text said: "or if its a lng time ago it'll just have the date in mm/dd/yyyy format"

    // Let's stick to user text: "mm/dd/yyyy"
    return date.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
    });
}
