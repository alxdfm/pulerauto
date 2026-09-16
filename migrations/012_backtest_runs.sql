-- Epic 5: backtest_runs (spec §18). OOS runs must use reconstructed fees.

CREATE TABLE backtest_runs (
  id                   BIGSERIAL PRIMARY KEY,
  strategy_id          BIGINT NOT NULL REFERENCES strategies(id),
  pool_id              BIGINT NOT NULL REFERENCES pools(id),
  window_start         TIMESTAMPTZ NOT NULL,
  window_end           TIMESTAMPTZ NOT NULL,
  is_out_of_sample     BOOLEAN NOT NULL,
  fee_source           TEXT NOT NULL CHECK (fee_source IN ('reconstructed_segments','modeled')),
  jit_factor_applied   NUMERIC(10,6),
  n_trials             INTEGER NOT NULL,
  reality_check_pvalue NUMERIC(10,8),
  regimes_covered      SMALLINT NOT NULL,
  pnl_usd              NUMERIC(24,6),
  pnl_vs_hodl_usd      NUMERIC(24,6),
  pnl_vs_fullrange_usd NUMERIC(24,6),
  max_drawdown         NUMERIC(10,6),
  cvar_95              NUMERIC(24,6),
  time_in_range        NUMERIC(10,6),
  rebalance_count      INTEGER,
  total_costs_usd      NUMERIC(24,6),
  params_snapshot      JSONB NOT NULL,
  CHECK (NOT (fee_source = 'modeled' AND is_out_of_sample))
);

CREATE INDEX backtest_runs_pool_window_idx
  ON backtest_runs (pool_id, window_start DESC);

CREATE INDEX backtest_runs_oos_idx
  ON backtest_runs (strategy_id, is_out_of_sample)
  WHERE is_out_of_sample;
