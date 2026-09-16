-- Epic 3: alert rules + alerts (spec §18).
-- backtest_runs: migrations/012_backtest_runs.sql (Epic 5).
-- Note: date_trunc('hour', timestamptz) is STABLE (TZ-dependent), so dedup uses
-- explicit dedup_hour column set by the writer (UTC hour bucket).

CREATE TABLE alert_rules (
  id           BIGSERIAL PRIMARY KEY,
  position_id  BIGINT REFERENCES positions(id),
  strategy_id  BIGINT REFERENCES strategies(id),
  kind         TEXT NOT NULL CHECK (kind IN
                 ('range_proximity','range_exit','pnl_target','edge_decay',
                  'depth_spike','markout_negative','oracle_divergence',
                  'hedge_drift','margin_risk','data_gap','circuit_breaker')),
  threshold    NUMERIC(20,8),
  cooldown_sec INTEGER NOT NULL DEFAULT 900,
  channels     TEXT[] NOT NULL DEFAULT '{telegram}',
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (position_id IS NOT NULL OR strategy_id IS NOT NULL)
);

CREATE TABLE alerts (
  id           BIGSERIAL PRIMARY KEY,
  rule_id      BIGINT NOT NULL REFERENCES alert_rules(id),
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  dedup_hour   TIMESTAMPTZ NOT NULL,
  severity     TEXT NOT NULL CHECK (severity IN ('info','warn','action','critical')),
  dedup_key    TEXT NOT NULL,
  payload      JSONB NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE UNIQUE INDEX alerts_dedup_hourly
  ON alerts (rule_id, dedup_key, dedup_hour);

CREATE INDEX alerts_unacked_ts ON alerts (ts DESC) WHERE NOT acknowledged;

CREATE TABLE watcher_heartbeats (
  name         TEXT PRIMARY KEY,
  last_beat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  detail       JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE alert_rule_latches (
  rule_id      BIGINT PRIMARY KEY REFERENCES alert_rules(id) ON DELETE CASCADE,
  active       BOOLEAN NOT NULL DEFAULT FALSE,
  since_at     TIMESTAMPTZ,
  last_value   NUMERIC(20,8),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
