# Última Sessão — Contexto Persistido

**Última atualização:** 2026-09-15  
**Sessão:** Sync de docs pós Epic 2–3 + push; code review registrado como dívida

---

## O que foi feito (histórico recente)

- **Epic 2:** positions schema/math/ingest/snapshots; fixtures sintético + Orca live
- **Epic 3:** alert_rules/alerts, watcher histerese+dedup, Telegram dry-run
- **Git:** commits pequenos (rule atualizada); push `master` → origin
- **Soak swaps:** chunks até ~1151 swaps; gate fee **100%** (`mismatched=0`); span calendário ainda curto (~14 min) — profundidade 30d exige mais RPC
- **Docs:** README / OVERVIEW / STACK / CLAUDE / WORKPLAN alinhados a Epics 0–3

---

## Estado

```
Funcionando:     indexer, analyzer snapshots, watcher alerts
Em progresso:    soak swaps 30d (RPC); soak alertas 7d zero-dup
Bloqueado:       nada crítico
Dívida:          ver WORKPLAN Epic 2/3 (pending fees, latch→emit, pool bind, …)
Próximo epic:    Epic 4 — edge_ratio, markout, regime
                 (ou corrigir dívida Epic 2/3 antes)
```

---

## Próximos passos

1. Continuar `pnpm swaps:backfill --hours 720` em RPC com quota até span ≥30d
2. Corrigir dívida Epic 2/3 do code review **ou** Epic 4 (sinal)
3. Rodar `watcher` 7d e validar zero duplicados; setar `TELEGRAM_*` se live

---

## Comandos

```bash
pnpm db:migrate
pnpm test
pnpm indexer
pnpm swaps:check
SOLANA_RPC_URL=https://solana.publicnode.com pnpm swaps:backfill --hours 720 --max 100 --delay-ms 400
pnpm positions:capture-fixture
pnpm positions:index --mint <nft> --wallet <addr>
pnpm positions:snapshot --position <id>
pnpm pnl:check --position <id>
pnpm watcher:once
pnpm watcher
```
