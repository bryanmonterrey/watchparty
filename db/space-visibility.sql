-- Make a space's "Hidden" option mean something for the SPACE, not just its post.
--
-- Additive with a default. Apply to BOTH Supabase projects per CLAUDE.md.
--
-- ## The bug
--
-- The create dialog (create-dialog/space-setup) offers Visible / Hidden, and
-- that choice was written ONLY to the post's `visibility` column. But
-- `community_spaces` had no visibility concept at all: `spaces.listLive`
-- returns every LIVE space to every authenticated caller, and `spaces.join`
-- checks only that the space exists and is LIVE. So "Hidden" hid the feed post
-- while the room itself stayed listed and walk-in-able by anyone signed in —
-- the label promised privacy the system did not implement.
--
-- ## What the values mean here
--
--   public    listed in spaces.listLive, and its post reaches the feed
--   unlisted  absent from listLive and from the feed; reachable by direct link
--
-- `private` is deliberately NOT in this enum. Real invite-only access needs a
-- per-user grant checked in `join`, which is a feature, not a column — adding
-- the word without the enforcement is how this bug happened the first time.
ALTER TABLE community_spaces
    ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public';

-- Partial: listLive's filter is `visibility = 'public'`, so only that value is
-- ever looked up by this index, and unlisted rows are the rare case.
CREATE INDEX IF NOT EXISTS idx_community_spaces_visibility
    ON community_spaces (visibility)
    WHERE visibility <> 'public';
