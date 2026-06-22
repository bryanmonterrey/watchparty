-- ----------------------------------------------------------------------------
-- feed_signals backfill — seed the Phoenix ranker with EXISTING engagement
-- ----------------------------------------------------------------------------
-- Run once, by hand, AFTER db/feed-signals.sql. Derives historical signals from
-- the tables that already record engagement so the ranker has user history from
-- day one instead of waiting for new interactions to accumulate.
--
-- Idempotent: deterministic ids (`bf_<kind>_<sourceid>`) + ON CONFLICT DO
-- NOTHING, so re-running never duplicates. Inserts only into feed_signals.
-- Action indices: 1=fav, 4=reply, 5=quote, 6=repost, 13=video-view.
-- ----------------------------------------------------------------------------

-- Favorites ← likes (post likes only)
INSERT INTO feed_signals (id, "userId", "subjectId", "subjectType", "authorId", "actionType", value, surface, "createdAt")
SELECT 'bf_fav_' || l.id, l."userId", l."contentId", 'post', p."userId", 1, 1, 'home', l."createdAt"
FROM likes l
JOIN posts p ON p.id = l."contentId"
WHERE l."contentType" = 'post'
ON CONFLICT (id) DO NOTHING;

-- Replies ← posts with replyToId (the actor replied to the parent's author)
INSERT INTO feed_signals (id, "userId", "subjectId", "subjectType", "authorId", "actionType", value, surface, "createdAt")
SELECT 'bf_reply_' || c.id, c."userId", c."replyToId", 'post', parent."userId", 4, 1, 'home', c."createdAt"
FROM posts c
JOIN posts parent ON parent.id = c."replyToId"
WHERE c."replyToId" IS NOT NULL AND c.status <> 'deleted'
ON CONFLICT (id) DO NOTHING;

-- Reposts / quotes ← posts with repostOfId (quote = carries its own content)
INSERT INTO feed_signals (id, "userId", "subjectId", "subjectType", "authorId", "actionType", value, surface, "createdAt")
SELECT 'bf_rt_' || r.id, r."userId", r."repostOfId", 'post', orig."userId",
       CASE WHEN r.content IS NOT NULL AND length(trim(r.content)) > 0 THEN 5 ELSE 6 END,
       1, 'home', r."createdAt"
FROM posts r
JOIN posts orig ON orig.id = r."repostOfId"
WHERE r."repostOfId" IS NOT NULL AND r.status <> 'deleted'
ON CONFLICT (id) DO NOTHING;

-- Video quality views ← video_progress past a 30s watch threshold
INSERT INTO feed_signals (id, "userId", "subjectId", "subjectType", "authorId", "actionType", value, surface, "createdAt")
SELECT 'bf_vqv_' || vp."userId" || '_' || vp."postId", vp."userId", vp."postId", 'post', p."userId", 13, vp."currentTime", 'shorts', vp."updatedAt"
FROM video_progress vp
JOIN posts p ON p.id = vp."postId"
WHERE vp."currentTime" >= 30
ON CONFLICT (id) DO NOTHING;
