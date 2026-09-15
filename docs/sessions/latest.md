# Última Sessão — Contexto Persistido

**Última atualização:** 2026-09-15  
**Sessão:** Qualidade (dívida Epic 2/3) + Epic 4 sinal + soaks kickoff

---

## O que foi feito

- **Soak tooling:** `pnpm swaps:span`, `pnpm alerts:dedup-check`; backfill 30d reiniciado (publicnode, chunks 100)
- **Epic 2 debt closed:** nested client fix; collect USD; fee checkpoints/outside (`008`); whirlpool bind; mint idempotent; entry_* required on create; `nft_mint NOT NULL`
- **Epic 3 debt closed:** FIRED after emit; `episode_fired`; `delivery_status`; single-client watch cycle (`009`)
- **Epic 4:** math EdgeRatio/Markout/regime; `010_pool_metrics_daily`; `metrics:daily`, `ranking:weekly`, `markout:check`

---

## Estado

```
Funcionando:     indexer, analyzer snapshots+pool metrics, watcher, Epic 4 math
Em progresso:    soak swaps → span ≥30d; soak alertas 7d (após watcher contínuo)
Bloqueado:       nada crítico
Dívida:          watcher edge_decay/markout_negative (follow-up)
Próximo epic:    Epic 5 — backtest + walk-forward (após soak 30d)
```

---

## Próximos passos

1. Acompanhar `pnpm swaps:span 30` até `ok: true`
2. `pnpm watcher` 7d + `pnpm alerts:dedup-check 7`
3. Após span: `pnpm metrics:daily` + `pnpm ranking:weekly`
4. Epic 5

---

## Comandos

```bash
pnpm db:migrate
pnpm test
pnpm swaps:span 30
pnpm swaps:backfill --hours 720 --max 100 --delay-ms 400
pnpm alerts:dedup-check 7
pnpm metrics:daily --day YYYY-MM-DD
pnpm ranking:weekly
pnpm markout:check
pnpm watcher
```
