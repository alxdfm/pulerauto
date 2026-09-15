# Overview do Sistema

> Preenchido no setup inicial (2026-09-15). Atualize quando a arquitetura mudar significativamente.

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
[RPC Solana / EVM]
      │
      ▼
[indexer]  →  pool_states, swaps, tick events
      │
      ▼
[PostgreSQL 16 + TimescaleDB]
      │
      ▼
[analyzer] →  fee capture, LVR, edge_ratio, markout, P&L
      │
      ▼
[watcher]  →  alertas (histerese + dedup) → Telegram (default)
      │
      ▼
[executor] →  dry-run → live (Fase 7; signer isolado)
```

Roadmap deliberado: **contabilidade → sinal → execução** (Parte IV da spec).

---

## Módulos principais

| Módulo | Responsabilidade | Localização |
|--------|------------------|-------------|
| Spec / math | Modelo LVR, break-even, fee capture | `docs/architecture/lp-assistant-spec-v2.md` |
| indexer | Ingestão on-chain → hypertables | previsto: `src/indexer/` |
| analyzer | Métricas derivadas e ranking | previsto: `src/analyzer/` |
| watcher | Alertas | previsto: `src/watcher/` |
| executor | Execução dry-run/live | previsto: `src/executor/` |
| math core | Primitivas W, A, LVR, ticks | previsto: `src/math/` |

---

## Integrações externas

| Serviço | Tipo | Para que serve |
|---------|------|----------------|
| Solana RPC | RPC | Estado Orca / swaps (Fase 0) |
| Orca Whirlpools | on-chain program | Pool SOL/USDC piloto |
| PostgreSQL + TimescaleDB | DB | Schema §14–18 |
| Telegram | Alertas | Canal default de notificações |
| EVM RPC / Uniswap | RPC | Multi-chain (Fase 6+) |
| Perp venue (TBD) | API | Hedges (após execução) |

---

## Contextos de domínio

- **Market state**: pools, swaps, segmentos, liquidez por tick
- **Positions & strategies**: carteiras, posições, rebalances, hedges
- **Signal**: edge_ratio, markout, regime, ranking
- **Risk & alerts**: regras, dedup, circuit breakers
- **Execution**: dry-run / live (último bounded context a ativar)
