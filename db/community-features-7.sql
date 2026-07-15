-- Community batch 7: server profile (banner, description, traits, privacy).
-- Additive. Applied 2026-07-15.
--
-- banner_color     flat CSS color for the profile card banner (no gradients)
-- description      "why should people join" — shown on the invite page
-- traits           comma-separated personality chips (max 5, app-enforced)
-- private_profile  when true, invite links show only name + icon

ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS banner_color text;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS traits text;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS private_profile boolean;
