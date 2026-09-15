# Overview do Sistema

> Atualizado: 2026-09-15 (Epics 0–3).

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
[analyzer] →  position_snapshots, P&L decomposto
              (LVR / edge_ratio / markout: Epic 4)
      │
      ▼
[watcher]  →  alertas (histerese + dedup) → Telegram (dry-run sem token)
      │
      ▼
[executor] →  dry-run → live (Fase 7; signer isolado)      (ainda não)
```

Roadmap deliberado: **contabilidade → sinal → execução** (Parte IV da spec).  
Fase atual: contabilidade (0–2) + alertas (3) no código; próximo = Epic 4 (sinal).  
Soak: swaps calendário 30d e alertas 7d zero-dup ainda em resume (RPC / mercado).

---

## Módulos principais

| Módulo | Responsabilidade | Localização |
|--------|------------------|-------------|
| Spec | Modelo LVR, break-even, fee capture | `docs/architecture/lp-assistant-spec-v2.md` |
| math core | W, A, LVR, ticks, sqrt-price, swap-segments, fee-capture, position P&L | `src/math/` |
| indexer | Whirlpool decode, ticks Fixed/Dynamic, swaps/`Traded`, Position | `src/indexer/` |
| db | client, migrate, invariantes §15 | `src/db/` |
| analyzer | P&L snapshots (LVR/edge depois) | `src/analyzer/` |
| watcher | Alertas histerese + dedup + heartbeat | `src/watcher/` |
| executor | Execução dry-run/live | previsto: `src/executor/` |

---

## Integrações externas

| Serviço | Tipo | Para que serve |
|---------|------|----------------|
| Solana RPC | RPC | Estado Orca / swaps / positions (leitura) |
| Orca Whirlpools | on-chain program | Pool SOL/USDC piloto + DynamicTickArray + Position |
| PostgreSQL + TimescaleDB | DB | Schema §14–18 + `swap_segments` + cursors + alerts |
| Telegram | Alertas | Canal default (dry-run se token ausente) |
| EVM RPC / Uniswap | RPC | Multi-chain (Fase 6+) |
| Perp venue (TBD) | API | Hedges (após execução) |

---

## Contextos de domínio

- **Market state**: pools, swaps, segmentos, liquidez por tick (checkpoints; events contínuos ainda não)
- **Positions & strategies**: carteiras, posições, rebalances, hedges DDL (lógica de hedge = Fase 7)
- **Signal**: edge_ratio, markout, regime, ranking (Epic 4+)
- **Risk & alerts**: regras, dedup, heartbeat (Epic 3; soak 7d pendente)
- **Execution**: dry-run / live (Epic 7)
