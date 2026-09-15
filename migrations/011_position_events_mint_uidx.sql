-- Fix: mint idempotency index must be partial (kind = 'mint' only).

DROP INDEX IF EXISTS position_events_mint_tx_uidx;

CREATE UNIQUE INDEX position_events_mint_tx_uidx
  ON position_events (position_id, tx_ref)
  WHERE kind = 'mint';
