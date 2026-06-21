-- Spaces "request to speak": listeners raise a hand; host invites them up.
-- Additive, safe (nullable-with-default). Cleared on any role change.
ALTER TABLE community_space_participants
  ADD COLUMN IF NOT EXISTS hand_raised boolean NOT NULL DEFAULT false;
