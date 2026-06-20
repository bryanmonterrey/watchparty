-- Affiliate badge columns on the user table.
-- Additive + nullable = safe on the shared (dev == prod) Supabase DB; reversible
-- via DROP COLUMN. Run by hand (not part of drizzle push), then wire the
-- affiliate fields into the feed/content router selects.
--
--   affiliate_username  org this user is affiliated to (links the badge + alt text)
--   affiliate_icon_url  org logo shown inside the affiliate badge square

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS affiliate_username text,
  ADD COLUMN IF NOT EXISTS affiliate_icon_url text;
