# Plano de Trabalho — Pulerauto

> Derivado da Parte IV de `lp-assistant-spec-v2.md`.  
> Ordem fixa: **contabilidade → sinal → execução**.  
> Atualizado: 2026-09-16

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
- `pnpm swaps:span` → gate calendário ≥30d + fee 100%
- ADR: `docs/decisions/2026-09-15_whirlpool-traded-ingest.md`

---

## Epic 2 — Positions + P&L decomposto

**Status (2026-09-15):** schema + math + ingest + snapshots + gates sintético/live.

**Done quando:** P&L bate UI do DEX **ao centavo**, inclusive através de um rebalance.  
**Done (hoje):** migration §16; math amounts/V/feeGrowth/P&L; decoder Position; rebalance fecha/abre; `position_snapshots`; fixture sintético + posições live Orca reconciliadas ao centavo vs amounts on-chain.

**Dívida conhecida (code review):** **fechada (2026-09-15)** — nested client, fee outside/checkpoint persistidos (`008` + `011` mint uidx parcial), collect USD por token, bind por whirlpool, mint idempotente + entry_* obrigatório no create, `nft_mint NOT NULL`. ADR: `2026-09-15_position-fee-entry.md`.

- Schema: `migrations/006_positions.sql` + `008_position_fee_state.sql` + `011_position_events_mint_uidx.sql`
- Math: `position-amounts`, `position-value`, `fee-growth-inside`, `position-pnl`
- Indexer: `position-decode`, `persist-position`, `index-position`
- Analyzer: `src/analyzer/position-snapshot.ts`
- Scripts: `positions:index` (exige `--entry-*` na criação), `positions:snapshot`, `positions:capture-fixture`, `pnl:check`
- ADR: `docs/decisions/2026-09-15_whirlpool-position-decode.md`
- Fixtures: `fixtures/synthetic-rebalance-pnl.json`, `fixtures/orca-sol-usdc-positions.json`

---

## Epic 3 — Alertas (histerese + dedup)

**Status (2026-09-15):** schema + watcher + Telegram dry-run + testes dedup/histerese.

**Done quando:** zero alertas duplicados em 7 dias de mercado real.  
**Done (hoje):** `alert_rules`/`alerts` com dedup horário (`dedup_hour` UTC); latches de histerese; heartbeat; `pnpm watcher` / `watcher:once`; Telegram dry-run sem token.

**Dívida conhecida (code review):** **fechada (2026-09-15)** — FIRED só após emit; `episode_fired`; `delivery_status`; DB checkout sem HTTP de canal. ADR: `2026-09-15_watcher-latch-after-emit.md`. Soak 7d zero-dup ainda em calendário (`pnpm alerts:dedup-check`).

- Schema: `migrations/007_alerts.sql` + `009_alert_latch_fired.sql`
- Watcher: `src/watcher/` (range_exit, range_proximity, data_gap)
- ADR: `docs/decisions/2026-09-15_watcher-alerts.md` (+ latch-after-emit)

---

## Epic 4 — Sinal: edge_ratio, markout, regime

**Status (2026-09-15):** math + `pool_metrics_daily` + ranking + markout fixture; soak 30d ainda em resume para σ estável.

**Done quando:** ranking semanal reproduzível; markout com sinal validado em caso conhecido.  
**Done (hoje):** `src/math/{depth-v2,sigma-implied,edge-ratio,markout,regime,sigma-realized}`; migration `010_pool_metrics_daily.sql`; `metrics:daily` / `ranking:weekly` / `markout:check`; fixture `fixtures/markout-sign-cases.json`. Alertas `edge_decay`/`markout_negative` ainda não wired no watcher.

- Math + analyzer: `pool-metrics-daily.ts`, `weekly-ranking.ts`
- ADR: `2026-09-15_epic4-sigma-sampling.md`
- Soak Epic 1 (`pnpm swaps:span`) ainda limita qualidade de `sigma_30d` / ER 90d

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
1. Soak Epic 1 — backfill até span ≥30d (em andamento; pnpm swaps:span)
2. Soak alertas 7d — pnpm watcher + alerts:dedup-check
3. Epic 5 — backtest / walk-forward
4. Wire watcher edge_decay / markout_negative (follow-up Epic 4)
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
