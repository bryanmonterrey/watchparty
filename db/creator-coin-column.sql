-- Creator coins: a coin that is ABOUT a person rather than a piece of content.
--
-- Every token so far is backed by a post — the post IS the content and the coin
-- rides on it (posts.tokenId). A creator coin has no post: its subject is the
-- creator, and its content page is their profile. So the only thing that
-- distinguishes it in this table is this flag; `creatorId` already says whose
-- it is.
--
-- The partial unique index is the real rule: ONE creator coin per person. A
-- creator having two coins about themselves is incoherent — which is the
-- favourite is undecidable, and the profile page has one slot. Enforced here
-- rather than in the mutation so a race can't produce a second one.
--
-- Note this differs from every other coin in WHO MAY LAUNCH it. A post's or
-- stream's coin can be launched by anyone (the first buy is the launch); a
-- creator coin can only be launched by its creator. That rule lives in the
-- mutation, since it's about the caller, not the row.
--
-- Additive and nullable-by-default, per CLAUDE.md. Existing rows are all
-- content coins and default to false.

ALTER TABLE tokens ADD COLUMN IF NOT EXISTS is_creator_coin boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_one_creator_coin
    ON tokens ("creatorId")
    WHERE is_creator_coin;

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'tokens' AND column_name = 'is_creator_coin';
