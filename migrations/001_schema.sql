-- Epic 0: reference + market state (spec sections 14-15)

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE chains (
  id              SMALLINT PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  kind            TEXT NOT NULL CHECK (kind IN ('evm','svm')),
  native_symbol   TEXT NOT NULL,
  avg_tx_cost_usd NUMERIC(18,6),
  finality_ms     INTEGER
);

CREATE TABLE dexes (
  id                 SMALLINT PRIMARY KEY,
  chain_id           SMALLINT NOT NULL REFERENCES chains(id),
  name               TEXT NOT NULL,
  model              TEXT NOT NULL CHECK (model IN ('clmm_tick','clmm_bin','cpmm','stable')),
  dynamic_fee        BOOLEAN NOT NULL DEFAULT FALSE,
  fee_growth_shift   SMALLINT NOT NULL,
  protocol_fee_share NUMERIC(6,4) NOT NULL DEFAULT 0,
  program_addr       TEXT NOT NULL,
  UNIQUE (chain_id, name)
);

CREATE TABLE tokens (
  id            BIGSERIAL PRIMARY KEY,
  chain_id      SMALLINT NOT NULL REFERENCES chains(id),
  address       TEXT NOT NULL,
  symbol        TEXT,
  decimals      SMALLINT NOT NULL,
  mint_authority_revoked   BOOLEAN,
  freeze_authority_revoked BOOLEAN,
  top10_holder_pct         NUMERIC(6,4),
  first_seen_at            TIMESTAMPTZ,
  risk_flags               JSONB NOT NULL DEFAULT '{}',
  UNIQUE (chain_id, address)
);

CREATE TABLE pools (
  id             BIGSERIAL PRIMARY KEY,
  dex_id         SMALLINT NOT NULL REFERENCES dexes(id),
  address        TEXT NOT NULL,
  token0_id      BIGINT NOT NULL REFERENCES tokens(id),
  token1_id      BIGINT NOT NULL REFERENCES tokens(id),
  fee_tier_bps   NUMERIC(10,4),
  tick_spacing   INTEGER,
  bin_step_bps   INTEGER,
  created_at     TIMESTAMPTZ,
  UNIQUE (dex_id, address),
  CHECK (token0_id <> token1_id),
  CHECK (fee_tier_bps IS NOT NULL OR bin_step_bps IS NOT NULL)
);

CREATE INDEX ON pools (token0_id, token1_id);

CREATE TABLE pool_states (
  pool_id            BIGINT NOT NULL REFERENCES pools(id),
  ts                 TIMESTAMPTZ NOT NULL,
  block_or_slot      BIGINT NOT NULL,
  sqrt_price         NUMERIC(78,0) NOT NULL,
  tick               INTEGER NOT NULL,
  liquidity          NUMERIC(40,0) NOT NULL,
  depth_v2_equiv_usd NUMERIC(24,6),
  fee_growth_global0 NUMERIC(78,0) NOT NULL,
  fee_growth_global1 NUMERIC(78,0) NOT NULL,
  tvl_usd            NUMERIC(24,6),
  PRIMARY KEY (pool_id, ts, block_or_slot)
);

SELECT create_hypertable('pool_states', 'ts', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');

CREATE TABLE swaps (
  pool_id           BIGINT NOT NULL REFERENCES pools(id),
  ts                TIMESTAMPTZ NOT NULL,
  block_or_slot     BIGINT NOT NULL,
  tx_ref            TEXT NOT NULL,
  event_path        TEXT NOT NULL,
  sender            TEXT,
  amount0           NUMERIC(78,0) NOT NULL,
  amount1           NUMERIC(78,0) NOT NULL,
  sqrt_price_before NUMERIC(78,0) NOT NULL,
  sqrt_price_after  NUMERIC(78,0) NOT NULL,
  tick_before       INTEGER NOT NULL,
  tick_after        INTEGER NOT NULL,
  liquidity_before  NUMERIC(40,0) NOT NULL,
  fee_amount        NUMERIC(78,0),
  router            TEXT,
  priority_fee      NUMERIC(40,0),
  PRIMARY KEY (pool_id, ts, tx_ref, event_path)
);

SELECT create_hypertable('swaps', 'ts', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');

CREATE INDEX ON swaps (pool_id, ts DESC);

CREATE INDEX ON swaps (sender, ts DESC);

CREATE TABLE tick_liquidity_events (
  pool_id           BIGINT NOT NULL REFERENCES pools(id),
  ts                TIMESTAMPTZ NOT NULL,
  block_or_slot     BIGINT NOT NULL,
  tick_index        INTEGER NOT NULL,
  d_liquidity_net   NUMERIC(40,0) NOT NULL,
  d_liquidity_gross NUMERIC(40,0) NOT NULL,
  tx_ref            TEXT NOT NULL,
  PRIMARY KEY (pool_id, ts, tick_index, tx_ref)
);

SELECT create_hypertable('tick_liquidity_events', 'ts', if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day');

CREATE TABLE tick_liquidity_checkpoints (
  pool_id         BIGINT NOT NULL REFERENCES pools(id),
  ts              TIMESTAMPTZ NOT NULL,
  tick_index      INTEGER NOT NULL,
  liquidity_net   NUMERIC(40,0) NOT NULL,
  liquidity_gross NUMERIC(40,0) NOT NULL,
  PRIMARY KEY (pool_id, ts, tick_index)
);
