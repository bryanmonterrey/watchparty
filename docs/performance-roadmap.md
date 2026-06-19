# Performance & scaling roadmap

A living doc of perf work done and the changes to make **later** — each with a
*trigger* so we act when the data justifies it, not preemptively. The golden
rule learned the hard way: **measure the table before optimizing the query.**
A perfect index on a 53-row table does nothing.

> Snapshot when written (2026-06): `posts` ≈ 53 rows. Single Supabase project
> `ugpzuypoyeuiebqbzqcm` (us-west-2) used for **both dev and prod**. Stack:
> Next.js 16 + tRPC + TanStack Query + better-auth + Drizzle (postgres.js).

---

## Done

| Change | What it fixed | Where |
|---|---|---|
| Consolidated session reads onto `useAuthSession` (React Query) | Killed a 2nd session system (`authClient.useSession` nanostore) that re-fetched `/api/auth/get-session` on mount churn → 429 storm | `hooks/use-auth-session.ts`, feed/video components |
| Batched poll fetching via `PollProvider` + `getPollsForPosts` | Removed the per-post `getPollForPost` N+1 (~18 round-trips/feed page → 2) | `components/browse/poll-context.tsx`, `server/routers/content.ts` |
| `httpBatchLink` → `httpBatchStreamLink` | Removed head-of-line blocking: fast procedures in a batch no longer wait for the slowest | `lib/trpc/client.ts` |
| Feed indexes (`idx_posts_feed`, `idx_posts_user_created`, `idx_posts_repostof`, `idx_bookmarks_content`) | **Forward-looking only** — no effect at 53 rows; prevents a cliff at scale | `db/feed-indexes.sql` (already applied to DB) |

---

## To do later (ordered by when the trigger is likely to hit)

### 1. Separate dev from prod database — **highest risk, do before real users**
Today `bun dev` reads/writes the live production DB. Every local experiment
touches real rows, and one `drizzle-kit push` could `DROP`/`ALTER` live columns.
- **Trigger:** before onboarding real users, or the first time a local test
  mutates data you cared about.
- **Action:** use Supabase **branching** (throwaway DB copy per branch) or a
  second project for dev. Point `.env.local` at it. Keep `drizzle-kit push`
  pointed *only* at the dev DB.

### 2. Remove redundant interaction queries
The feed already returns `isLiked/isBookmarked/isReposted` embedded per post,
yet `browse-feed` also fires `getLikedPostIds` + `getBookmarkedPostIds` +
`getRepostedPostIds` (3 extra round-trips).
- **Before deleting:** confirm the embedded flags are *always* populated —
  the fallback may exist for realtime-inserted posts that arrive without them.
- **Trigger:** now-ish (it's cheap and safe once verified).
- **File:** `components/browse/browse-feed.tsx` (~lines 398–408).

### 3. Cloudflare Hyperdrive for prod
postgres.js over the open internet from Workers is slow per round-trip.
Hyperdrive pools + caches connections at the edge.
- **Trigger:** when deploying to Cloudflare (already the planned target).
- **Note:** shrinks *latency per query*; does **not** replace indexes or fix N+1.

### 4. Indexes start to matter
The applied indexes are inert until the planner stops choosing seq scans.
- **Trigger:** `posts` > ~10k rows, or `EXPLAIN ANALYZE` on the feed shows
  `Seq Scan` + `Sort` instead of `Index Scan using idx_posts_feed`.
- **Action:** re-run the `EXPLAIN ANALYZE` in `db/feed-indexes.sql`. Add more
  indexes only when a real query plan demands it.

### 5. "For you" feed is reverse-chronological, not ranked
`getFeed` for-you just does `ORDER BY "createdAt" DESC`. `baseScore` exists on
`posts` but is unused in ranking.
- **Trigger:** when chronological stops feeling good (enough content/users).
- **Action:** rank by a score (recency + engagement). Watch query cost — a
  scored feed usually needs a materialized/precomputed score column + index,
  not an expensive `ORDER BY` over a computed expression.

### 6. Move mute/block filtering into SQL
`getFeed` for-you fetches all muted/blocked ids and filters in JS
(over-fetches `limit + 5` to compensate).
- **Trigger:** users who mute/block hundreds, or feed pages returning short.
- **Action:** `WHERE "userId" NOT IN (subquery)` or anti-join in the query.

### 7. Denormalize the bookmark count
`getFeed` computes bookmark count as a correlated subquery per row. (Likes,
reposts, comments are already denormalized columns on `posts`.)
- **Trigger:** if `EXPLAIN ANALYZE` shows the subquery dominating feed cost.
- **Action:** add a `bookmarks` integer column to `posts`, maintain it in the
  toggle mutation like `likes`/`reposts` already are.

### 8. better-auth session cost
Each `/api/auth/get-session` hits DB + Upstash Redis; Sentinel rate-limits
bursts (the original 429s). `cookieCache` (30 min) already softens this.
- **Trigger:** 429s reappear, or get-session shows up hot in logs again.
- **Action:** confirm one session source (done), lengthen `cookieCache`,
  and/or raise the Sentinel/`rateLimit` window. Don't retry 429s on the client.

---

## Principles (so we don't repeat past mistakes)

1. **Measure the table before optimizing the query.** Check `reltuples` /
   `pg_total_relation_size` first. Small table = the bottleneck is elsewhere
   (round-trips, latency, blocking) — not the query plan.
2. **Round-trips beat query tuning at small scale.** N+1 (many small queries)
   was the real cost here, not slow SQL. Batch by `postIds[]`; the codebase
   idiom is `getXForPosts({ postIds })` (see `getLikedPostIds`, `getPollsForPosts`).
3. **One source of truth per piece of state.** Two session systems caused the
   429 storm. Prefer the shared cached query over ad-hoc fetches.
4. **`EXPLAIN ANALYZE` before adding an index.** Want `Index Scan`, not
   `Seq Scan` + `Sort`. An unused index is just write overhead.
