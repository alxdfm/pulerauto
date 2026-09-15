-- Epic 3 debt: explicit episode fired flag + alert delivery status.

ALTER TABLE alert_rule_latches
  ADD COLUMN IF NOT EXISTS episode_fired BOOLEAN NOT NULL DEFAULT FALSE;

-- Migrate sentinel epoch since_at → episode_fired
UPDATE alert_rule_latches
SET episode_fired = TRUE,
    since_at = updated_at
WHERE active = TRUE
  AND since_at IS NOT NULL
  AND since_at = TIMESTAMPTZ '1970-01-01 00:00:00+00';

ALTER TABLE alerts
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending','delivered','failed','dry_run'));
