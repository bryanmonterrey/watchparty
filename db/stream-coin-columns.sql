-- A stream can have a coin.
--
-- The ticker is chosen in stream setup BEFORE going live, so it has to live
-- somewhere between "typed into the box" and "broadcast started". These two
-- columns are that place.
--
-- Why not create the coin the moment a ticker is typed: a stream that never
-- goes live would leave a draft coin behind for a broadcast that never
-- happened. The ticker is intent; the coin is created when the broadcast
-- starts, and `token_id` is filled in then.
--
-- Additive and nullable, per CLAUDE.md — safe against the live DB, and
-- reversible by dropping the columns. Streams without a coin keep both NULL,
-- which is every existing row.

ALTER TABLE streams ADD COLUMN IF NOT EXISTS ticker   text;
ALTER TABLE streams ADD COLUMN IF NOT EXISTS token_id text;

-- The coin a live stream launched, for the rare lookup by token.
CREATE INDEX IF NOT EXISTS idx_streams_token ON streams (token_id) WHERE token_id IS NOT NULL;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'streams' AND column_name IN ('ticker', 'token_id');
