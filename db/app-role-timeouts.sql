-- Self-healing timeouts for the app's DB role (2026-08-06 outage follow-up).
--
-- A prune pass's client (worker isolate) died mid-statement and the orphaned
-- transaction sat "active" on the pooler's server connection for 1.5h,
-- queueing every DB-backed request on the site behind it. The client of
-- Postgres in that chain is Supavisor (which stayed alive), so socket-level
-- dead-client detection never fires — a wall-clock statement_timeout is what
-- actually reclaims the connection.
--
-- Applies to NEW sessions of the postgres role (the app path via
-- Hyperdrive/Supavisor, and also the dashboard SQL editor / manual scripts).
-- Long manual maintenance can override per-session:
--   set statement_timeout = 0;
alter role postgres set statement_timeout = '30s';
alter role postgres set idle_in_transaction_session_timeout = '60s';
