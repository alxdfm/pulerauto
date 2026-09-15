-- Fase 1: swap_segments (spec section 15)

CREATE TABLE IF NOT EXISTS swap_segments (
  pool_id        BIGINT NOT NULL,
  ts             TIMESTAMPTZ NOT NULL,
  tx_ref         TEXT NOT NULL,
  event_path     TEXT NOT NULL,
  seg_index      SMALLINT NOT NULL,
  tick_lo        INTEGER NOT NULL,
  tick_hi        INTEGER NOT NULL,
  liquidity_seg  NUMERIC(40,0) NOT NULL,
  amount_in_seg  NUMERIC(78,0) NOT NULL,
  fee_seg        NUMERIC(78,0) NOT NULL,
  PRIMARY KEY (pool_id, ts, tx_ref, event_path, seg_index)
);

SELECT create_hypertable('swap_segments', 'ts', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');
