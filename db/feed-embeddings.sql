-- ----------------------------------------------------------------------------
-- post_embeddings — Phoenix retrieval corpus (out-of-network candidate discovery)
-- ----------------------------------------------------------------------------
-- Run by hand (Supabase SQL editor / psql), after db/feed-signals.sql. Additive:
-- enables pgvector + creates one new table. The feed-corpus cron fills it by
-- calling the Phoenix /embed endpoint (item-tower vectors, 128-dim) for recent
-- posts + live streams; feed retrieval ANN-searches it for candidates beyond the
-- user's follows/recency window.
-- ----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS post_embeddings (
    "subjectId"   text NOT NULL,
    "subjectType" text NOT NULL DEFAULT 'post',
    "authorId"    text,
    embedding     vector(128) NOT NULL,
    "updatedAt"   timestamp NOT NULL DEFAULT now(),
    PRIMARY KEY ("subjectId", "subjectType")
);

-- Approximate-NN index (cosine). The retrieval tower outputs unit-norm vectors,
-- so cosine ≈ dot product, matching Phoenix's retrieval similarity.
CREATE INDEX IF NOT EXISTS idx_post_embeddings_ann
    ON post_embeddings USING hnsw (embedding vector_cosine_ops);

-- Server-only table (filled by cron, read by the feed ranker via the privileged
-- connection). No client access.
ALTER TABLE post_embeddings ENABLE ROW LEVEL SECURITY;
