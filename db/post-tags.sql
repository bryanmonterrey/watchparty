-- Tags: which coins a post references, from the composer's ticker dropdown.
--
-- Additive and nullable-free by construction — a new table touches nothing that
-- exists, which is the only kind of change this repo applies to a live database
-- without ceremony (see CLAUDE.md on destructive migrations).
--
-- Apply to BOTH projects (dev and prod):
--   bun scripts/db/apply-sql.mjs db/post-tags.sql
--
-- Keyed by (network, token_address) rather than a tokens.id foreign key: most
-- coins tagged here are external and have no row in `tokens`. `token_id` is
-- filled only when the coin is one of our launches.

CREATE TABLE IF NOT EXISTS post_tags (
    post_id       text        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    network       text        NOT NULL,
    token_address text        NOT NULL,
    symbol        text        NOT NULL,
    token_id      text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, network, token_address)
);

-- The chart and the coin table both ask "every tag for this coin, newest
-- first". Without this they seq-scan the table on every coin page open.
CREATE INDEX IF NOT EXISTS post_tags_coin_idx
    ON post_tags (network, token_address, created_at DESC);

-- Rendering a post's own chips, and cascade cleanup.
CREATE INDEX IF NOT EXISTS post_tags_post_idx ON post_tags (post_id);
