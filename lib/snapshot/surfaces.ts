import type { InfiniteData } from "@tanstack/react-query";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@/server/routers";
import { createInfiniteSnapshotStore } from "./infinite";

/**
 * The smaller snapshot surfaces, declared together.
 *
 * Chat (`lib/community/chat-snapshot.ts`) and the feed
 * (`lib/feed/feed-snapshot.ts`) keep their own modules — one carries a legacy
 * key prefix and both carry enough rationale to be worth reading on their own.
 * These five are a declaration each, and five files of ten lines would hide the
 * one thing worth comparing across them: **max age**.
 *
 * ## Max age is per-surface, and it is the real safety valve
 *
 * A snapshot is painted before the refetch resolves, so for that moment the
 * screen asserts data of unknown age. How wrong that can be depends entirely on
 * what the surface shows:
 *
 * - a bookmarked post from last week is still that post → days
 * - a notification from yesterday still happened → a day
 * - a coin alert, a price, a ranked board → **minutes**, because a stale number
 *   presented as current is worse than a spinner, and someone may act on it
 *
 * Tuning the age here is why the numbers themselves need no per-component
 * plumbing: nothing old enough to mislead is ever painted in the first place.
 * Surfaces that want belt and braces can still dim on `isPlaceholderData`.
 *
 * ## Everything here is keyed by viewer
 *
 * Notifications and bookmarks are the viewer's by definition; post rows carry
 * `isLiked`/`isBookmarked`/`isReposted` from `postSelectFields`; and
 * `coinFeed.list` runs `buildFilters(input, ctx.user?.id ?? null)`, so even the
 * coin rail is viewer-shaped. See `lib/snapshot/keys.ts` for why that matters
 * more here than it looks — multi-session switches accounts with no sign-out.
 */

type Outputs = inferRouterOutputs<AppRouter>;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * `null` passes, a string fails.
 *
 * The failure being guarded is a payload that went through plain JSON instead
 * of superjson, which turns every `Date` into a string — so a row still renders
 * but every date-fns call on it yields "Invalid Date". A nullable timestamp
 * column is a normal, correct `null` and must not be mistaken for that.
 */
const dateOk = (v: unknown) => v == null || v instanceof Date;

// ── Coin alerts rail ────────────────────────────────────────────────────────
// Mounted from `app/(app)/(rails)/layout.tsx`, so it backs /home, /feed and
// /coin/*. Being a layout it does NOT remount when navigating between those —
// the win is on cold entry to the group, which is how most sessions start.

type AlertsPage = Outputs["coinFeed"]["list"];

export const alertsSnapshotStore = createInfiniteSnapshotStore<AlertsPage, string | null | undefined>({
    prefix: "watchparty.snap.alerts:",
    version: 1,
    /** Viewer × filter set. Filters change often; this holds the few you use. */
    maxEntries: 6,
    maxBytes: 192 * 1024,
    /** Market data. Half an hour is already generous for a "what just happened" rail. */
    maxAgeMs: 30 * MINUTE,
    validatePage: (page) => Array.isArray(page?.items) && dateOk(page.items[0]?.occurredAt),
    sanitizePage: (page) => (page.items.length ? page : null),
});

// ── Notifications ───────────────────────────────────────────────────────────
// The panel queries with `enabled: open`, so without this every single opening
// of the bell shows a spinner — placeholder data paints even while disabled.

type NotificationsPage = Outputs["notification"]["getNotifications"];

export const notificationsSnapshotStore = createInfiniteSnapshotStore<NotificationsPage, string | undefined>({
    prefix: "watchparty.snap.notifications:",
    version: 1,
    maxEntries: 3,
    maxBytes: 128 * 1024,
    /**
     * A day. Read/unread state can drift within that, and deliberately so: the
     * unread COUNT comes from `getUnreadCount`, a separate live query, so the
     * badge is never painted from here.
     */
    maxAgeMs: DAY,
    validatePage: (page) => Array.isArray(page?.notifications) && dateOk(page.notifications[0]?.createdAt),
    sanitizePage: (page) => (page.notifications.length ? page : null),
});

// ── Bookmarks ───────────────────────────────────────────────────────────────
// The safest surface in the app to snapshot: it is yours, it only changes when
// you change it, and you arrive at it on purpose.

type BookmarksPage = Outputs["content"]["getBookmarks"];

export const bookmarksSnapshotStore = createInfiniteSnapshotStore<BookmarksPage, string | undefined>({
    prefix: "watchparty.snap.bookmarks:",
    version: 1,
    maxEntries: 3,
    maxBytes: 256 * 1024,
    maxAgeMs: 7 * DAY,
    validatePage: (page) => Array.isArray(page?.posts) && dateOk(page.posts[0]?.createdAt),
    sanitizePage: (page) => (page.posts.length ? page : null),
});

// ── A profile's posts ───────────────────────────────────────────────────────
// Keyed by viewer AND by the profile being viewed — `getPostsByUser` also runs
// through `postSelectFields`, so the rows carry the *viewer's* interaction
// state for someone else's posts.

type ProfilePostsPage = Outputs["content"]["getPostsByUser"];

export const profilePostsSnapshotStore = createInfiniteSnapshotStore<ProfilePostsPage, string | undefined>({
    prefix: "watchparty.snap.profile-posts:",
    version: 1,
    /** Your own profile plus the handful you actually revisit. */
    maxEntries: 8,
    maxBytes: 256 * 1024,
    maxAgeMs: DAY,
    validatePage: (page) => Array.isArray(page?.posts) && dateOk(page.posts[0]?.createdAt),
    sanitizePage: (page) => (page.posts.length ? page : null),
});

// ── Trending board ──────────────────────────────────────────────────────────

type TrendingPage = Outputs["trending"]["list"];

export const trendingSnapshotStore = createInfiniteSnapshotStore<TrendingPage, number | null | undefined>({
    prefix: "watchparty.snap.trending:",
    version: 1,
    /** One per filter combination in use. */
    maxEntries: 4,
    maxBytes: 192 * 1024,
    /**
     * The shortest of the lot. This is a *ranked* board of live prices — both
     * the numbers and the order go wrong, and the ordering going wrong is the
     * sneaky one, because a row in the wrong place still looks authoritative.
     * The cron behind it refreshes every few minutes anyway.
     */
    maxAgeMs: 15 * MINUTE,
    validatePage: (page) => Array.isArray(page?.items) && dateOk(page.items[0]?.fetchedAt),
    sanitizePage: (page) => (page.items.length ? page : null),
});

export type AlertsSnapshot = InfiniteData<AlertsPage, string | null | undefined>;
export type NotificationsSnapshot = InfiniteData<NotificationsPage, string | undefined>;
export type BookmarksSnapshot = InfiniteData<BookmarksPage, string | undefined>;
export type ProfilePostsSnapshot = InfiniteData<ProfilePostsPage, string | undefined>;
export type TrendingSnapshot = InfiniteData<TrendingPage, number | null | undefined>;
