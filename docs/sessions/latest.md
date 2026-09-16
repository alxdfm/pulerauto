# Última Sessão — Contexto Persistido

**Última atualização:** 2026-09-16  
**Sessão:** Soaks + watcher edge/markout + Epic 5 + code-review fixes + docs audit

---

## O que foi feito

- Migration `012_backtest_runs.sql`; `alerts:ensure-rules`; watcher `edge_decay` / `markout_negative` wired
- Epic 5 scaffolding + correções de review (L calibrado, fees por token, full-range reconstruído, WF obrigatório, N+1 segments, span-bridge erros explícitos)
- Docs alinhados (README / CLAUDE / STACK / OVERVIEW / WORKPLAN / UL / ADRs / sessão)

---

## Estado

```
Funcionando:     indexer/analyzer/watcher (5 kinds), Epic 5 CLI, testes 69/69
Em progresso:    backfill / span-bridge quando RPC disponível
Bloqueado:       swaps:span 30 sem RPC archival (publicnode ~2d ledger)
Dívida:          Reality Check OOS p<0.05; amostra §12 ≥90d / 3 regimes
```

---

## Desbloqueio crítico

```bash
# SOLANA_RPC_URL=… archival (Helius/Alchemy/…)
pnpm swaps:span-bridge --days 30
pnpm swaps:backfill --hours 720 --max 500 --delay-ms 150
pnpm swaps:span 30
pnpm backtest:run --strategy 1 --pool 1 --days 90 --train-days 30 --test-days 7 --n-trials 3
pnpm backtest:check --strategy 1
```
