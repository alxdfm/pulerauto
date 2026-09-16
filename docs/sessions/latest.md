# Última Sessão — Contexto Persistido

**Última atualização:** 2026-09-16  
**Sessão:** Docs congruentes pós Epic 0–4 + push qualidade/sinal

---

## O que foi feito (histórico recente)

- **Qualidade Epic 2/3 + Epic 4** commitados e pushados (`master`)
- **Code review fix:** RPC fora de tx; Telegram fora do checkout DB; fees por token de input; métricas sem fabricar vol; índice mint parcial (`011`)
- **Docs:** README / OVERVIEW / STACK / CLAUDE / WORKPLAN / CODE_STYLE alinhados a Epics 0–4

---

## Estado

```
Funcionando:     indexer, analyzer (snapshots + pool_metrics_daily), watcher, Epic 4 math
Em progresso:    soak swaps → span ≥30d; soak alertas 7d
Bloqueado:       nada crítico
Dívida:          watcher edge_decay / markout_negative (follow-up)
Próximo epic:    Epic 5 — backtest + walk-forward (após soak 30d)
```

---

## Próximos passos

1. `pnpm swaps:span 30` até `ok: true`
2. `pnpm watcher` 7d + `pnpm alerts:dedup-check 7`
3. `pnpm metrics:daily` + `pnpm ranking:weekly` com histórico mais profundo
4. Epic 5

---

## Comandos

```bash
pnpm db:migrate
pnpm test
pnpm swaps:span 30
SOLANA_RPC_URL=https://solana.publicnode.com pnpm swaps:backfill --hours 720 --max 100 --delay-ms 400
pnpm alerts:dedup-check 7
pnpm metrics:daily --day YYYY-MM-DD
pnpm ranking:weekly
pnpm markout:check
pnpm positions:index --mint <nft> --wallet <addr> --entry-price … --entry-amount0 … --entry-amount1 … --entry-value-usd …
pnpm watcher
```
