-- Seed: Solana + Orca Whirlpool + SOL/USDC pilot pool (Fase 0)

INSERT INTO chains (id, name, kind, native_symbol, avg_tx_cost_usd, finality_ms)
VALUES (1, 'solana', 'svm', 'SOL', 0.001, 400)
ON CONFLICT (id) DO NOTHING;

-- Orca Whirlpools program (mainnet)
INSERT INTO dexes (id, chain_id, name, model, dynamic_fee, fee_growth_shift, protocol_fee_share, program_addr)
VALUES (
  1,
  1,
  'orca_whirlpool',
  'clmm_tick',
  FALSE,
  64,
  0,
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'
)
ON CONFLICT (id) DO NOTHING;

-- Native SOL wrapped (WSOL) and USDC
INSERT INTO tokens (chain_id, address, symbol, decimals, mint_authority_revoked, freeze_authority_revoked)
VALUES
  (1, 'So11111111111111111111111111111111111111112', 'SOL', 9, TRUE, TRUE),
  (1, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'USDC', 6, FALSE, FALSE)
ON CONFLICT (chain_id, address) DO NOTHING;

-- Whirlpool SOL/USDC tickSpacing 4 (highest TVL mainnet as of seed)
-- Address from Orca API: Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE
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
ON CONFLICT (dex_id, address) DO NOTHING;
