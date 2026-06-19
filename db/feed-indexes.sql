-- Feed performance indexes
-- ----------------------------------------------------------------------------
-- Run these by hand (Supabase SQL editor or psql), one statement at a time.
-- They use CREATE INDEX CONCURRENTLY: no table lock, safe on the live DB.
-- They are NOT part of drizzle-kit push (this repo never runs migrations).
--
-- Why each one exists: see server/routers/feed.ts getFeed.
--   - for-you feed:  WHERE visibility/status ... ORDER BY "createdAt" DESC + cursor
--   - following:     WHERE "userId" IN (...) AND status ... ORDER BY "createdAt" DESC
--   - isReposted:    EXISTS (... WHERE "repostOfId" = X AND "userId" = Y)
--   - bookmark count: (SELECT count(*) FROM bookmarks WHERE "contentId" = X AND "contentType" = 'post')
--
-- CONCURRENTLY cannot run inside a transaction — run each statement separately.
-- If a build is interrupted it leaves an INVALID index; drop it and re-run
-- (the names below are stable, so re-running is safe).

-- 1) The main for-you feed: lets Postgres scan published/public posts already in
--    createdAt-desc order, so the cursor (lt createdAt) + ORDER BY do zero sorting.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_feed
ON posts (visibility, status, "createdAt" DESC);

-- 2) Following feed + profile feeds (getPostsByUser): per-user timeline in order.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_user_created
ON posts ("userId", status, "createdAt" DESC);

-- 3) Reposts: powers the leftJoin on repostOfId AND the per-row isReposted EXISTS.
--    Partial (most posts are originals with repostOfId = NULL) keeps it small.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_repostof
ON posts ("repostOfId", "userId")
WHERE "repostOfId" IS NOT NULL;

-- 4) Bookmark count subquery. `likes` already has idx_likes_content for its
--    equivalent; `bookmarks` was missing the matching (contentId, contentType)
--    index, so that correlated subquery was scanning the table per feed row.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookmarks_content
ON bookmarks ("contentId", "contentType");

-- After creating, sanity-check one is being used:
--   EXPLAIN ANALYZE
--   SELECT id FROM posts
--   WHERE visibility = 'public' AND status = 'published'
--   ORDER BY "createdAt" DESC LIMIT 25;
-- You want to see "Index Scan using idx_posts_feed", not "Seq Scan" + "Sort".
