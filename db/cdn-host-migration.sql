-- Move stored asset URLs from the raw Supabase host onto cdn.watchparty.xyz.
--
-- The project now serves storage (and realtime) through a Supabase custom
-- domain, so every NEW upload already writes cdn.watchparty.xyz. This rewrites
-- the rows written before the cutover so the app serves one host everywhere.
--
-- Safe because it is a pure hostname swap: cdn.watchparty.xyz is a CNAME to
-- ugpzuypoyeuiebqbzqcm.supabase.co and the storage paths are byte-identical
-- (verified by fetching the same object through both hosts — same 200, same
-- 28190 bytes). Old URLs keep working either way; this is about consistency,
-- not repair.
--
-- Idempotent: re-running matches nothing, because the old host is gone from
-- every row it touched.
--
-- WHAT THIS CANNOT FIX: coins already minted. A token's metadata `uri` is
-- written on-chain at launch and can never be rewritten, so any coin minted
-- before the cutover points at the old host forever. Updating tokens.imageUrl
-- below only changes what OUR UI reads, not what a wallet or explorer resolves.
-- That asymmetry is the reason the domain was worth settling early.

BEGIN;

-- Counts before. Expected at time of writing:
--   tokens.imageUrl 55 · posts.token_image 52 · posts.videoUrl 27
--   posts.thumbnailUrl 27 · user.avatar_url 16 · posts.imageUrl 7
--   posts.media 3 · user.banner_url 1
SELECT 'tokens.imageUrl' AS col, count(*) FROM tokens WHERE "imageUrl" LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%'
UNION ALL SELECT 'posts.token_image', count(*) FROM posts WHERE token_image LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%'
UNION ALL SELECT 'posts.videoUrl', count(*) FROM posts WHERE "videoUrl" LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%'
UNION ALL SELECT 'posts.thumbnailUrl', count(*) FROM posts WHERE "thumbnailUrl" LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%'
UNION ALL SELECT 'posts.imageUrl', count(*) FROM posts WHERE "imageUrl" LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%'
UNION ALL SELECT 'posts.media', count(*) FROM posts WHERE media::text LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%'
UNION ALL SELECT 'user.avatar_url', count(*) FROM "user" WHERE avatar_url LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%'
UNION ALL SELECT 'user.banner_url', count(*) FROM "user" WHERE banner_url LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%';

UPDATE posts SET "imageUrl" = replace("imageUrl", 'ugpzuypoyeuiebqbzqcm.supabase.co', 'cdn.watchparty.xyz')
WHERE "imageUrl" LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%';

UPDATE posts SET token_image = replace(token_image, 'ugpzuypoyeuiebqbzqcm.supabase.co', 'cdn.watchparty.xyz')
WHERE token_image LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%';

UPDATE posts SET "videoUrl" = replace("videoUrl", 'ugpzuypoyeuiebqbzqcm.supabase.co', 'cdn.watchparty.xyz')
WHERE "videoUrl" LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%';

UPDATE posts SET "thumbnailUrl" = replace("thumbnailUrl", 'ugpzuypoyeuiebqbzqcm.supabase.co', 'cdn.watchparty.xyz')
WHERE "thumbnailUrl" LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%';

-- media is jsonb. Cast to text, swap, cast back — the structure is untouched
-- because only the host substring inside each url changes.
UPDATE posts SET media = replace(media::text, 'ugpzuypoyeuiebqbzqcm.supabase.co', 'cdn.watchparty.xyz')::jsonb
WHERE media::text LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%';

UPDATE tokens SET "imageUrl" = replace("imageUrl", 'ugpzuypoyeuiebqbzqcm.supabase.co', 'cdn.watchparty.xyz')
WHERE "imageUrl" LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%';

UPDATE "user" SET avatar_url = replace(avatar_url, 'ugpzuypoyeuiebqbzqcm.supabase.co', 'cdn.watchparty.xyz')
WHERE avatar_url LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%';

UPDATE "user" SET banner_url = replace(banner_url, 'ugpzuypoyeuiebqbzqcm.supabase.co', 'cdn.watchparty.xyz')
WHERE banner_url LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%';

-- Every count below should be 0.
SELECT 'tokens.imageUrl' AS col, count(*) FROM tokens WHERE "imageUrl" LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%'
UNION ALL SELECT 'posts.token_image', count(*) FROM posts WHERE token_image LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%'
UNION ALL SELECT 'posts.videoUrl', count(*) FROM posts WHERE "videoUrl" LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%'
UNION ALL SELECT 'posts.thumbnailUrl', count(*) FROM posts WHERE "thumbnailUrl" LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%'
UNION ALL SELECT 'posts.imageUrl', count(*) FROM posts WHERE "imageUrl" LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%'
UNION ALL SELECT 'posts.media', count(*) FROM posts WHERE media::text LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%'
UNION ALL SELECT 'user.avatar_url', count(*) FROM "user" WHERE avatar_url LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%'
UNION ALL SELECT 'user.banner_url', count(*) FROM "user" WHERE banner_url LIKE '%ugpzuypoyeuiebqbzqcm.supabase.co%';

COMMIT;
