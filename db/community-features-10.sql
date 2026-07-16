-- Community batch 10: per-tab screenshot parity (docs/serversettings).
-- Additive. Applied 2026-07-16.
--
-- rules / rules_required   server rules list (newline-separated) + must-agree gate
-- age_restricted           18+ confirmation before viewing the server
-- tag_badge / tag_color    server tag badge emoji + chip color
-- custom_invite            vanity invite code (boost level 3 perk)
-- show_boost_bar           boost progress bar in the channel sidebar
-- default_notifications    'all' | 'mentions' — default rail-badge behavior
-- activity_alerts          join-surge notice posted to the system channel
-- automod_flagged_words    built-in profanity filter for members
-- template_code            shareable code that pre-fills a new server's structure

ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS rules text;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS rules_required boolean;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS age_restricted boolean;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS tag_badge text;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS tag_color text;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS custom_invite text;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS show_boost_bar boolean;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS default_notifications text;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS activity_alerts boolean;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS automod_flagged_words boolean;
ALTER TABLE community_servers ADD COLUMN IF NOT EXISTS template_code text;

-- Vanity codes and template codes resolve like invite codes — must be unique.
CREATE UNIQUE INDEX IF NOT EXISTS uq_community_servers_custom_invite
    ON community_servers (custom_invite) WHERE custom_invite IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_community_servers_template_code
    ON community_servers (template_code) WHERE template_code IS NOT NULL;

-- Members: when they agreed to the rules + how they joined ('invite'|'discovery')
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS rules_agreed_at timestamptz;
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS join_method text;
