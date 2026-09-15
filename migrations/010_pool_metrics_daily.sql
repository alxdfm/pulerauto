-- Epic 4: pool_metrics_daily (spec §17). chain_metrics_weekly deferred.

CREATE TABLE pool_metrics_daily (
  pool_id            BIGINT NOT NULL REFERENCES pools(id),
  day                DATE NOT NULL,
  volume_usd         NUMERIC(24,2) NOT NULL,
  fees_lp_usd        NUMERIC(24,2) NOT NULL,
  tvl_usd            NUMERIC(24,2) NOT NULL,
  depth_v2_equiv_usd NUMERIC(24,2) NOT NULL,
  sigma_30d          NUMERIC(14,6) NOT NULL,
  sigma_implied      NUMERIC(14,6) NOT NULL,
  edge_ratio         NUMERIC(14,6) NOT NULL,
  reward_apr         NUMERIC(14,6),
  reward_haircut     NUMERIC(6,4),
  efficiency_ratio   NUMERIC(10,6),
  er_q80_90d         NUMERIC(10,6),
  routed_ratio       NUMERIC(10,6),
  markout_5m_bps     NUMERIC(14,6),
  markout_30m_bps    NUMERIC(14,6),
  jit_factor         NUMERIC(10,6),
  unique_senders     INTEGER,
  top_sender_pct     NUMERIC(10,6),
  n_bins_active      INTEGER,
  PRIMARY KEY (pool_id, day)
);

CREATE INDEX pool_metrics_daily_edge_idx
  ON pool_metrics_daily (day DESC, edge_ratio DESC);
