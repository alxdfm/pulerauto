-- Epic 2: positions, strategies, wallets, events, snapshots, hedges (spec §16)

CREATE TABLE wallets (
  id        BIGSERIAL PRIMARY KEY,
  chain_id  SMALLINT NOT NULL REFERENCES chains(id),
  address   TEXT NOT NULL,
  label     TEXT,
  read_only BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (chain_id, address)
);

CREATE TABLE strategies (
  id                  BIGSERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  pool_id             BIGINT REFERENCES pools(id),
  mode                TEXT NOT NULL DEFAULT 'advisory'
                      CHECK (mode IN ('advisory','dry_run','live')),
  range_width_pct     NUMERIC(10,4) NOT NULL,
  range_skew          NUMERIC(10,4) NOT NULL DEFAULT 0,
  ladder_legs         SMALLINT NOT NULL DEFAULT 1,
  rebalance_trigger   NUMERIC(10,4) NOT NULL,
  hysteresis_band_pct NUMERIC(10,4) NOT NULL,
  hysteresis_min_sec  INTEGER NOT NULL,
  min_edge_multiple   NUMERIC(10,4) NOT NULL DEFAULT 3,
  min_edge_ratio      NUMERIC(10,4) NOT NULL DEFAULT 1.3,
  regime_filter       BOOLEAN NOT NULL DEFAULT TRUE,
  er_quantile_block   NUMERIC(6,4) DEFAULT 0.80,
  hedge_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  hedge_band_pct      NUMERIC(10,4),
  hedge_venue         TEXT,
  max_position_usd    NUMERIC(24,2) NOT NULL,
  max_daily_loss_usd  NUMERIC(24,2) NOT NULL,
  params              JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE positions (
  id              BIGSERIAL PRIMARY KEY,
  wallet_id       BIGINT NOT NULL REFERENCES wallets(id),
  pool_id         BIGINT NOT NULL REFERENCES pools(id),
  strategy_id     BIGINT REFERENCES strategies(id),
  nft_mint        TEXT,
  tick_lower      INTEGER NOT NULL,
  tick_upper      INTEGER NOT NULL,
  liquidity       NUMERIC(40,0) NOT NULL,
  opened_at       TIMESTAMPTZ NOT NULL,
  closed_at       TIMESTAMPTZ,
  entry_price     NUMERIC(40,18) NOT NULL,
  entry_amount0   NUMERIC(78,0) NOT NULL,
  entry_amount1   NUMERIC(78,0) NOT NULL,
  entry_value_usd NUMERIC(24,6) NOT NULL,
  parent_position_id BIGINT REFERENCES positions(id),
  CHECK (tick_lower < tick_upper),
  UNIQUE (wallet_id, pool_id, nft_mint)
);

CREATE TABLE position_events (
  id           BIGSERIAL PRIMARY KEY,
  position_id  BIGINT NOT NULL REFERENCES positions(id),
  ts           TIMESTAMPTZ NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN
                 ('mint','increase','decrease','collect','burn','rebalance')),
  amount0 NUMERIC(78,0), amount1 NUMERIC(78,0),
  fee0 NUMERIC(78,0),    fee1 NUMERIC(78,0),
  gas_usd NUMERIC(18,6), slippage_usd NUMERIC(18,6),
  tx_ref TEXT NOT NULL
);
CREATE INDEX ON position_events (position_id, ts DESC);

CREATE TABLE hedges (
  id             BIGSERIAL PRIMARY KEY,
  position_id    BIGINT NOT NULL REFERENCES positions(id),
  venue          TEXT NOT NULL,
  opened_at      TIMESTAMPTZ NOT NULL,
  closed_at      TIMESTAMPTZ,
  side           TEXT NOT NULL CHECK (side IN ('short','long')),
  size_token0    NUMERIC(40,18) NOT NULL,
  entry_price    NUMERIC(40,18) NOT NULL,
  margin_usd     NUMERIC(24,6) NOT NULL,
  liq_price      NUMERIC(40,18),
  funding_paid_usd NUMERIC(24,6) NOT NULL DEFAULT 0,
  fees_usd       NUMERIC(24,6) NOT NULL DEFAULT 0
);

CREATE TABLE position_snapshots (
  position_id       BIGINT NOT NULL REFERENCES positions(id),
  ts                TIMESTAMPTZ NOT NULL,
  price             NUMERIC(40,18) NOT NULL,
  in_range          BOOLEAN NOT NULL,
  value_usd         NUMERIC(24,6) NOT NULL,
  hodl_value_usd    NUMERIC(24,6) NOT NULL,
  fees_earned_usd   NUMERIC(24,6) NOT NULL,
  fees_pending_usd  NUMERIC(24,6) NOT NULL,
  rewards_usd       NUMERIC(24,6) NOT NULL,
  costs_usd         NUMERIC(24,6) NOT NULL,
  funding_usd       NUMERIC(24,6) NOT NULL DEFAULT 0,
  divergence_usd    NUMERIC(24,6) NOT NULL,
  pnl_vs_hodl_usd   NUMERIC(24,6) NOT NULL,
  delta_token0      NUMERIC(40,18),
  hedge_size        NUMERIC(40,18),
  cum_time_in_range NUMERIC(10,6),
  PRIMARY KEY (position_id, ts)
);
SELECT create_hypertable('position_snapshots','ts', if_not_exists => TRUE, chunk_time_interval => INTERVAL '30 days');
