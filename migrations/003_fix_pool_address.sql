-- Fix pilot pool address (wrong pubkey in initial seed)

UPDATE pools
SET address = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
    tick_spacing = 4,
    fee_tier_bps = 4.0
WHERE address = '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUz1JRdoVDEJpe';

INSERT INTO pools (dex_id, address, token0_id, token1_id, fee_tier_bps, tick_spacing, created_at)
SELECT
  1,
  'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
  t0.id,
  t1.id,
  4.0,
  4,
  now()
FROM tokens t0
JOIN tokens t1 ON t1.chain_id = 1 AND t1.symbol = 'USDC'
WHERE t0.chain_id = 1 AND t0.symbol = 'SOL'
  AND NOT EXISTS (
    SELECT 1 FROM pools p WHERE p.address = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE'
  );
