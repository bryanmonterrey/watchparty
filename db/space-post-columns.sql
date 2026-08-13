-- Starting a space creates a post (docs/next-session.md #3), the same way going
-- live does (db/stream-post-columns.sql).
--
-- Additive and nullable. Applied by hand to BOTH Supabase projects per
-- CLAUDE.md — no drizzle-kit push.

-- Which space this post IS, when it is one.
--
-- Separate from "streamId" rather than a shared polymorphic (source_type,
-- source_id) pair: two nullable columns with their own partial indexes cost
-- nothing here, and a polymorphic key would give up the ability to state in the
-- schema which table the value points at. Spaces are uuid-keyed and streams are
-- text-keyed, so a shared column could not even keep one type.
--
-- Stored as text, matching "streamId" and posts' own text id, rather than uuid:
-- nothing joins on it in SQL, and a uuid column would be the only one of its
-- kind on this table.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS "spaceId" text;

CREATE INDEX IF NOT EXISTS idx_posts_space_id
    ON posts ("spaceId")
    WHERE "spaceId" IS NOT NULL;
