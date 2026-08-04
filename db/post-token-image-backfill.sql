-- Backfill posts.token_image from the coin the post launched.
--
-- Why these rows are empty: createPost resolved the token image with a full
-- fallback chain (explicit token_image -> first post media -> creator avatar)
-- but that value was a const scoped INSIDE the `if (input.ticker)` block, so
-- only `tokens.imageUrl` received it. The posts row was written with the raw
-- `input.token_image`, which the composer usually doesn't send. The coin
-- therefore had an image everywhere that reads from `tokens`, while the feed
-- card's ticker pill — which reads posts.token_image — rendered the blank
-- tinted disc.
--
-- Fixed forward in server/routers/content.ts (the variable is hoisted so both
-- inserts use the same resolved value). This repairs the rows written before
-- that fix. Same shape as db/token-image-avatar-backfill.sql, which repaired
-- the mirror-image case on the tokens side.
--
-- Additive and idempotent: only fills NULLs, only where the joined token
-- actually has an image. Re-running it is a no-op. Nothing is overwritten, so
-- a post with a deliberately chosen image keeps it.

BEGIN;

-- Inspect first — this is the row count the UPDATE will touch.
SELECT count(*) AS rows_to_backfill
FROM posts p
JOIN tokens t ON t.id = p."tokenId"
WHERE p.token_image IS NULL
  AND t."imageUrl" IS NOT NULL;

UPDATE posts p
SET token_image = t."imageUrl"
FROM tokens t
WHERE t.id = p."tokenId"
  AND p.token_image IS NULL
  AND t."imageUrl" IS NOT NULL;

-- Should return 0.
SELECT count(*) AS remaining_null
FROM posts p
JOIN tokens t ON t.id = p."tokenId"
WHERE p.token_image IS NULL
  AND t."imageUrl" IS NOT NULL;

COMMIT;
