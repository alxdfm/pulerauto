# Overview do Sistema

> Atualizado: 2026-09-16 (Epics 0–5).

---

## O que este sistema faz

```
Pulerauto (LP Assistant) descobre, avalia e monitora posições CLMM
em Solana e EVM. Compara fee (prêmio) vs LVR (custo) para rankear
pools e alertar posições — modo advisory por padrão; execução live é opt-in.
```

---

## Fluxo principal

```
[RPC Solana]
      │
      ▼
[indexer]  →  pool_states, tick checkpoints (Fixed+Dynamic),
              swaps, swap_segments, positions / position_events
      │
      ▼
[PostgreSQL 16 + TimescaleDB]
      │
      ▼
[analyzer] →  position_snapshots, P&L decomposto,
              pool_metrics_daily (EdgeRatio, Markout, regime),
              BacktestRun (walk-forward + RealityCheck)
      │
      ▼
[watcher]  →  alertas (histerese + dedup) → Telegram (dry-run sem token)
              range_exit / range_proximity / data_gap / edge_decay / markout_negative
      │
      ▼
[executor] →  dry-run → live (Fase 7; signer isolado)      (ainda não)
```

Roadmap deliberado: **contabilidade → sinal → execução** (Parte IV da spec).  
Fase atual: Epics 0–5 no código; soak swaps 30d exige RPC archival (publicnode ~2d ledger).

---

## Módulos principais

| Módulo | Responsabilidade | Localização |
|--------|------------------|-------------|
| Spec | Modelo LVR, break-even, fee capture | `docs/architecture/lp-assistant-spec-v2.md` |
| math core | W, A, LVR, ticks, sqrt-price, swap-segments, fee-capture, position P&L, EdgeRatio, Markout, regime, WalkForward, RealityCheck | `src/math/` |
| indexer | Whirlpool decode, ticks Fixed/Dynamic, swaps/`Traded`, Position | `src/indexer/` |
| db | client, migrate, invariantes §15, swap-span, backtest_runs | `src/db/` |
| analyzer | P&L snapshots + `pool_metrics_daily` / ranking + BacktestRun | `src/analyzer/` |
| watcher | Alertas histerese + dedup + heartbeat (range / data_gap / edge / markout) | `src/watcher/` |
| executor | Execução dry-run/live | previsto: `src/executor/` |

---

## Integrações externas

| Serviço | Tipo | Para que serve |
|---------|------|----------------|
| Solana RPC | RPC | Estado Orca / swaps / positions (leitura) |
| Orca Whirlpools | on-chain program | Pool SOL/USDC piloto + DynamicTickArray + Position |
| PostgreSQL + TimescaleDB | DB | Schema §14–18 + `swap_segments` + cursors + alerts + `pool_metrics_daily` + `backtest_runs` |
| Telegram | Alertas | Canal default (dry-run se token ausente) |
| EVM RPC / Uniswap | RPC | Multi-chain (Fase 6+) |
| Perp venue (TBD) | API | Hedges (após execução) |

---

## Contextos de domínio

- **Market state**: pools, swaps, segmentos, liquidez por tick (checkpoints; events contínuos ainda não)
- **Positions & strategies**: carteiras, posições, rebalances, hedges DDL (lógica de hedge = Fase 7)
- **Signal**: EdgeRatio, Markout, regime, ranking semanal; alertas `edge_decay` / `markout_negative` wired
- **Risk & alerts**: regras, dedup, heartbeat (Epic 3; manter soak calendário com `pnpm watcher`)
- **Backtest**: WalkForward + RealityCheck + `backtest_runs` (Epic 5 scaffolding; Done OOS pendente)
- **Execution**: dry-run / live (Epic 7)
