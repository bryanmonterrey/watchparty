-- Adds the Cloudflare RealtimeKit meeting id to spaces for WebRTC audio.
-- Additive + nullable → safe on the shared dev/prod DB (see CLAUDE.md).
ALTER TABLE community_spaces
  ADD COLUMN IF NOT EXISTS media_meeting_id text;
