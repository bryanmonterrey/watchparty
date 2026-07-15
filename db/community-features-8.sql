-- Community batch 8: engagement system messages + automod rules. Additive.
-- Applied 2026-07-15.
--
-- system_channel_id       where welcome/boost messages post (null = #general)
-- welcome_messages        null/true = announce joins; false = off
-- boost_messages          null/true = announce boosts; false = off
-- automod_block_links     true = members can't post URLs
-- automod_block_mentions  true = members' messages with >5 mentions are blocked
-- messages.system         rendered as a compact system row in chat

ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS system_channel_id uuid;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS welcome_messages boolean;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS boost_messages boolean;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS automod_block_links boolean;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS automod_block_mentions boolean;
ALTER TABLE community_messages ADD COLUMN IF NOT EXISTS system boolean;
