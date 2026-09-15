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
| 0.D.1 Snapshot pool_states live | done |
| 0.D.3–4 Tick arrays on-chain | **done** (Fixed + Dynamic; fixture offline) |
| 0.D.5 Invariantes 1–3 (L) | done on-chain; sintético permanece só em unit tests |
| 0.D.2 Swaps ingest | pendente (Fase 1) |

**Done quando:** tick arrays reais + L reconstrói sem sintético; invariantes de liquidez em checkpoint on-chain.

---

## Epic 1 — Segmentação multi-tick + fee capture

**Status (2026-09-15):** pipeline done; invariante 5 = 100% no conjunto indexado.

**Done:** `Σ fee_seg = fee_amount` em **100%** dos swaps presentes na janela de 30d (gate SQL).  
Backfill contínuo de 30 dias de mercado no pool piloto exige RPC com rate limit alto (`pnpm swaps:backfill --hours 720`).

- Decoder `Traded` + `src/indexer/index-swaps.ts`
- Math `src/math/swap-segments.ts` + `allocateFeeSegments`
- `pnpm swaps:check` → `sum_fee_seg_equals_fee_amount`

---

## Epic 2 — Positions + P&L decomposto

**Done:** P&L bate UI do DEX **ao centavo**, inclusive através de um rebalance.

- Schema §16: `wallets`, `strategies`, `positions`, events, snapshots
- Contabilidade §13; encadeamento de rebalance
- Comparação com UI Orca em caso conhecido

---

## Epic 3 — Alertas (histerese + dedup)

**Done:** zero alertas duplicados em 7 dias de mercado real.

- Schema §18: rules + alerts
- Watcher process; Telegram default
- Heartbeat / liveness (§19)

---

## Epic 4 — Sinal: edge_ratio, markout, regime

**Done:** ranking semanal reproduzível; markout com sinal validado em caso conhecido.

- Métricas derivadas §17
- Markout §7 (sinal sobre `amount0`)
- Regime §11; filtros ER por quantil do par

---

## Epic 5 — Backtest + walk-forward

**Done:** supera 3 benchmarks OOS com Reality Check p < 0.05.

- Fees reconstruídas (não fee growth “chute”)
- Walk-forward; Reality Check / n_trials (§12)
- Gates OOS no DB

---

## Epic 6 — Multi-DEX (bins) → multi-chain

**Done:** estimador de LVR seleciona por `n_bins_active` (§10).

- Raydium / Meteora DLMM; depois EVM Uniswap v3/v4
- `fee_growth_shift` e modelo por DEX

---

## Epic 7 — Execução dry-run → live; hedge por último

**Done:** 30 dias dry-run sem divergência vs execução simulada.

- Processo `executor` isolado (§19)
- Controles: simulate, allowlist, limites, circuit breaker
- Hedges só depois de live estável

---

## Ordem de implementação sugerida (próximas sessões)

```
1. Epic 0 fechado (L exata Fixed+Dynamic)
2. Epic 1 — swaps → swap_segments (Σ fee_seg = fee_amount, 30d)
3. Epic 2 — positions + P&L
```

---

## Fora de escopo até a fase correspondente

| Item | Fase |
|------|------|
| UI / frontend | pós-sinal (depois de 4) ou paralelo leve só leitura |
| Executor / chaves | 7 |
| Hedge venues | 7 |
| Multi-pool ranking productizado | 4+ |
