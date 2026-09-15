# Overview do Sistema

> Preenchido no setup inicial (2026-09-15). Atualizado após Epic 0.D + Epic 1.

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
              swaps, swap_segments
      │
      ▼
[PostgreSQL 16 + TimescaleDB]
      │
      ▼
[analyzer] →  fee capture, LVR, edge_ratio, markout, P&L   (ainda não)
      │
      ▼
[watcher]  →  alertas (histerese + dedup) → Telegram       (ainda não)
      │
      ▼
[executor] →  dry-run → live (Fase 7; signer isolado)      (ainda não)
```

Roadmap deliberado: **contabilidade → sinal → execução** (Parte IV da spec).  
Fase atual: contabilidade (Epic 0–1 feitos; próximo = Epic 2 positions/P&L).

---

## Módulos principais

| Módulo | Responsabilidade | Localização |
|--------|------------------|-------------|
| Spec | Modelo LVR, break-even, fee capture | `docs/architecture/lp-assistant-spec-v2.md` |
| math core | W, A, LVR, ticks, sqrt-price, swap-segments, fee-capture | `src/math/` |
| indexer | Whirlpool decode, ticks Fixed/Dynamic, swaps/`Traded`, segments | `src/indexer/` |
| db | client, migrate, invariantes §15 | `src/db/` |
| analyzer | Métricas derivadas e ranking | previsto: `src/analyzer/` |
| watcher | Alertas | previsto: `src/watcher/` |
| executor | Execução dry-run/live | previsto: `src/executor/` |

---

## Integrações externas

| Serviço | Tipo | Para que serve |
|---------|------|----------------|
| Solana RPC | RPC | Estado Orca / swaps (leitura) |
| Orca Whirlpools | on-chain program | Pool SOL/USDC piloto + DynamicTickArray |
| PostgreSQL + TimescaleDB | DB | Schema §14–18 + `swap_segments` + cursors |
| Telegram | Alertas | Canal default (Epic 3+) |
| EVM RPC / Uniswap | RPC | Multi-chain (Fase 6+) |
| Perp venue (TBD) | API | Hedges (após execução) |

---

## Contextos de domínio

- **Market state**: pools, swaps, segmentos, liquidez por tick (checkpoints; events contínuos ainda não)
- **Positions & strategies**: carteiras, posições, rebalances, hedges (Epic 2+)
- **Signal**: edge_ratio, markout, regime, ranking (Epic 4+)
- **Risk & alerts**: regras, dedup, circuit breakers (Epic 3+)
- **Execution**: dry-run / live (Epic 7)
