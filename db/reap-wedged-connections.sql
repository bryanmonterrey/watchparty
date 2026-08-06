-- Wedged-connection reaper (2026-08-06, second outage of the day).
--
-- The wedge the role timeouts (db/app-role-timeouts.sql) CANNOT catch: a
-- worker isolate dies mid-protocol, and the pooler's server connection is
-- left with a COMPLETED query, state=active, waiting in ClientRead for a Sync
-- that will never arrive. statement_timeout stops ticking when the query
-- completes, idle_in_transaction requires the idle-in-tx state, and
-- socket-level dead-client detection sees Supavisor (alive) as the client —
-- so nothing times out and every request on the site queues behind the wedge.
-- It happened twice in one day (coin_candles prune, then mint_prices).
--
-- This pg_cron job reaps that state every minute from inside the database:
--   - active + waiting on ClientRead for >2 min: a live client never sits in
--     ClientRead mid-statement that long (real queries wait on CPU/IO/locks,
--     and the 30s role statement_timeout caps them anyway)
--   - idle in transaction >5 min: belt-and-suspenders for pooled sessions
--     that predate the role-level idle_in_transaction timeout
--
-- cron.schedule upserts by name; run via a postgres-role connection so the
-- job may terminate postgres-role backends.
SELECT cron.schedule(
  'reap-wedged-connections',
  '* * * * *',
  $$
    SELECT pg_terminate_backend(pid)
    FROM pg_stat_activity
    WHERE application_name = 'Supavisor'
      AND usename = 'postgres'
      AND (
        (state = 'active'
          AND wait_event_type = 'Client' AND wait_event = 'ClientRead'
          AND query_start < now() - interval '2 minutes')
        OR (state = 'idle in transaction'
          AND xact_start < now() - interval '5 minutes')
      );
  $$
);
