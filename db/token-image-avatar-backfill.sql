-- Backfill: a coin with no image of its own takes its creator's avatar.
--
-- 11 of 50 token rows had imageUrl NULL/'' (2026-07-28). Every one of them was
-- also unlinked from any post — coins created without a post behind them, which
-- is what a stream's coin is. The image is what the coin carries from then on,
-- so an empty one is permanent until something fills it.
--
-- Only touches rows that are already empty, so it can't overwrite real art, and
-- it's a no-op on re-run. The code-side fix is in server/routers/content.ts
-- (both token inserts now resolve the avatar fallback server-side) and in the
-- four launchToken call sites.
UPDATE tokens t
SET "imageUrl" = u.avatar_url,
    "updatedAt" = now()
FROM "user" u
WHERE u.id = t."creatorId"
  AND (t."imageUrl" IS NULL OR t."imageUrl" = '')
  AND u.avatar_url IS NOT NULL;
