-- Epic 2 debt: persist fee growth for pending-fee snapshots.

ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS fee_growth_checkpoint0 NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_growth_checkpoint1 NUMERIC(78,0) NOT NULL DEFAULT 0;

ALTER TABLE tick_liquidity_checkpoints
  ADD COLUMN IF NOT EXISTS fee_growth_outside0 NUMERIC(78,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fee_growth_outside1 NUMERIC(78,0) NOT NULL DEFAULT 0;

-- Whirlpool positions are NFT-keyed; forbid NULL mint duplicates.
UPDATE positions SET nft_mint = 'legacy-null-' || id::text WHERE nft_mint IS NULL;
ALTER TABLE positions ALTER COLUMN nft_mint SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS position_events_mint_tx_uidx
  ON position_events (position_id, tx_ref)
  WHERE kind = 'mint';
