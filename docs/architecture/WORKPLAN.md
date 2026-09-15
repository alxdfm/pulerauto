# Plano de Trabalho — Pulerauto

> Derivado da Parte IV de `lp-assistant-spec-v2.md`.  
> Ordem fixa: **contabilidade → sinal → execução**.  
> Atualizado: 2026-09-15

---

## Princípios

1. Uma fase só fecha com o **critério de conclusão** da spec — não com “parece ok”.
2. Math canônica em `src/math/` sem I/O; testes Vitest batem exemplos numéricos da Parte I.
3. Sem float para estado on-chain / fee growth / P&L canônico.
4. Não abrir `executor` antes da Fase 7.

---

## Epic 0 — Bootstrap + Fase 0

**Status (2026-09-15):** completo (L on-chain exata).

| Item | Status |
|------|--------|
| 0.A Bootstrap TS + Docker | done |
| 0.B Schema + seed Orca SOL/USDC | done (`Czfq3x...`) |
| 0.C Math mínimo + testes | done |
| 0.D.1 Snapshot `pool_states` live | done |
| 0.D.2 Swaps ingest | **done** (entregue no Epic 1) |
| 0.D.3–4 Tick arrays on-chain | **done** (Fixed + Dynamic; fixture offline) |
| 0.D.5 Invariantes 1–4 (L + fee_growth) | done on-chain; sintético só em unit tests |

**Done quando:** tick arrays reais + L reconstrói sem sintético; invariantes de liquidez em checkpoint on-chain. **Critério atingido.**

---

## Epic 1 — Segmentação multi-tick + fee capture

**Status (2026-09-15):** pipeline done; gate fee 100% no conjunto indexado; soak 30d de calendário em resume (RPC).

**Done (spec):** `Σ fee_seg = fee_amount` em **100%** dos swaps de 30 dias de mercado.  
**Done (hoje):** gate SQL 100% sobre swaps indexados; backfill resumível `pnpm swaps:backfill --hours 720 --max 0` (publicnode: batch=1; quota RPC acelera profundidade de calendário).

- Decoder `Traded` + `src/indexer/index-swaps.ts` / `persist-swap.ts`
- Math `src/math/swap-segments.ts` + `allocateFeeSegments`
- Cursor `indexer_cursors` (`migrations/005_indexer_cursors.sql`)
- `pnpm swaps:check` → `sum_fee_seg_equals_fee_amount`
- ADR: `docs/decisions/2026-09-15_whirlpool-traded-ingest.md`

---

## Epic 2 — Positions + P&L decomposto

**Status (2026-09-15):** schema + math + ingest + snapshots + gates sintético/live.

**Done quando:** P&L bate UI do DEX **ao centavo**, inclusive através de um rebalance.  
**Done (hoje):** migration §16; math amounts/V/feeGrowth/P&L; decoder Position; rebalance fecha/abre; `position_snapshots`; fixture sintético + posições live Orca reconciliadas ao centavo vs amounts on-chain.

**Dívida conhecida (code review — não trata como fechado §13 completo):**
- `analyzePositionFromDb` nested `withClient` (risco de deadlock no pool)
- pending fees sem `feeGrowthOutside`/checkpoint persistidos → não confiar em `fees_pending_usd` do path DB
- `SUM(fee0+fee1)/scale1` mistura tokens no collect
- `positions:index` usa `pools ORDER BY id LIMIT 1` (ignora whirlpool da Position)
- re-index gera `mint` events duplicados; `entry_*` no index live = mark atual
- `UNIQUE (wallet_id, pool_id, nft_mint)` não cobre `nft_mint` NULL

- Schema: `migrations/006_positions.sql`
- Math: `position-amounts`, `position-value`, `fee-growth-inside`, `position-pnl`
- Indexer: `position-decode`, `persist-position`, `index-position`
- Analyzer: `src/analyzer/position-snapshot.ts`
- Scripts: `positions:index`, `positions:snapshot`, `positions:capture-fixture`, `pnl:check`
- ADR: `docs/decisions/2026-09-15_whirlpool-position-decode.md`
- Fixtures: `fixtures/synthetic-rebalance-pnl.json`, `fixtures/orca-sol-usdc-positions.json`

---

## Epic 3 — Alertas (histerese + dedup)

**Status (2026-09-15):** schema + watcher + Telegram dry-run + testes dedup/histerese.

**Done quando:** zero alertas duplicados em 7 dias de mercado real.  
**Done (hoje):** `alert_rules`/`alerts` com dedup horário (`dedup_hour` UTC); latches de histerese; heartbeat; `pnpm watcher` / `watcher:once`; Telegram dry-run sem token.

**Dívida conhecida (code review):**
- latch `FIRED` persistido **antes** de `emitAlert` → episódio pode silenciar se cooldown/dedup rejeitar
- thrash de `withClient` por regra; falha Telegram ignorada após insert
- sentinel `since_at = epoch` para “já disparou” (preferir flag explícita)

- Schema: `migrations/007_alerts.sql`
- Watcher: `src/watcher/` (range_exit, range_proximity, data_gap)
- ADR: `docs/decisions/2026-09-15_watcher-alerts.md`

---

## Epic 4 — Sinal: edge_ratio, markout, regime

**Status:** não iniciado.

**Done quando:** ranking semanal reproduzível; markout com sinal validado em caso conhecido.

- Métricas derivadas §17
- Markout §7 (sinal sobre `amount0`)
- Regime §11; filtros ER por quantil do par

---

## Epic 5 — Backtest + walk-forward

**Status:** não iniciado.

**Done quando:** supera 3 benchmarks OOS com Reality Check p < 0.05.

- Fees reconstruídas (não fee growth “chute”)
- Walk-forward; Reality Check / n_trials (§12)
- Gates OOS no DB

---

## Epic 6 — Multi-DEX (bins) → multi-chain

**Status:** não iniciado.

**Done quando:** estimador de LVR seleciona por `n_bins_active` (§10).

- Raydium / Meteora DLMM; depois EVM Uniswap v3/v4
- `fee_growth_shift` e modelo por DEX

---

## Epic 7 — Execução dry-run → live; hedge por último

**Status:** não iniciado.

**Done quando:** 30 dias dry-run sem divergência vs execução simulada.

- Processo `executor` isolado (§19)
- Controles: simulate, allowlist, limites, circuit breaker
- Hedges só depois de live estável

---

## Ordem de implementação sugerida (próximas sessões)

```
1. Soak Epic 1 — continuar backfill até span ≥30d (RPC com quota)
2. Epic 4 — edge_ratio / markout / regime
3. Soak de alertas 7d (zero duplicados) em mercado real
```

---

## Fora de escopo até a fase correspondente

| Item | Fase |
|------|------|
| UI / frontend | pós-sinal (depois de 4) ou paralelo leve só leitura |
| Executor / chaves | 7 |
| Hedge venues | 7 |
| Multi-pool ranking productizado | 4+ |
| `tick_liquidity_events` contínuos | pós-checkpoint; útil p/ L histórica no backfill |
