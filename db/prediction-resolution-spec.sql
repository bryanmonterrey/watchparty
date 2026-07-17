-- AI market factory: machine-checkable resolution recipe on prediction
-- markets (null = resolve manually). Additive + nullable — safe on live data.
ALTER TABLE prediction_markets ADD COLUMN IF NOT EXISTS resolution_spec jsonb;
