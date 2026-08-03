-- Publish coin_candles over Supabase Realtime, so an open chart receives new
-- bars as the sync writes them instead of polling every 30s.
--
-- Phase 2 of docs/live-charts-plan. No new infrastructure: this is the same
-- channel the coin alerts rail already uses. At ~200 pools writing a 1m bar per
-- minute the volume is trivial, which is why a Durable Object isn't warranted
-- here (see Phase 3 for where one actually is).
--
-- NOTE: deliberately NOT `REPLICA IDENTITY FULL`. Replica identity governs what
-- the OLD record carries on UPDATE/DELETE; the NEW record always ships every
-- column. The chart only ever reads `new`, so FULL would just multiply WAL
-- volume for data nothing consumes.

ALTER PUBLICATION supabase_realtime ADD TABLE coin_candles;
