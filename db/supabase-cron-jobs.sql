-- ─── Supabase pg_cron Jobs ───────────────────────────────────────────────────
-- Run these in the Supabase SQL Editor after enabling the pg_cron extension
-- Dashboard → Database → Extensions → enable "pg_cron"

-- 1. Auto-end expired polls every 5 minutes
SELECT cron.schedule(
  'end-expired-polls',
  '*/5 * * * *',
  $$
    UPDATE polls
    SET "isEnded" = true
    WHERE "endsAt" < now()
      AND "isEnded" = false;
  $$
);

-- 2. Auto-expire gift subscriptions every hour
SELECT cron.schedule(
  'expire-gift-subscriptions',
  '0 * * * *',
  $$
    UPDATE gift_subscriptions
    SET status = 'expired'
    WHERE "expiresAt" < now()
      AND status = 'pending';
  $$
);

-- 3. Auto-expire active subscriptions that have passed their period end (daily at 1am)
SELECT cron.schedule(
  'expire-subscriptions',
  '0 1 * * *',
  $$
    UPDATE subscriptions
    SET status = 'expired'
    WHERE "currentPeriodEnd" < now()
      AND status = 'active'
      AND "cancelAtPeriodEnd" = true;
  $$
);

-- 4. Delete expired stories (daily cleanup at 2am)
SELECT cron.schedule(
  'cleanup-expired-stories',
  '0 2 * * *',
  $$
    DELETE FROM stories WHERE "expiresAt" < now();
  $$
);

-- ─── To view scheduled jobs ──────────────────────────────────────────────────
-- SELECT * FROM cron.job;

-- ─── To remove a job ─────────────────────────────────────────────────────────
-- SELECT cron.unschedule('end-expired-polls');
