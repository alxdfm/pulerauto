# Última Sessão — Contexto Persistido

**Última atualização:** 2026-09-15  
**Sessão:** Epic 3 — watcher / alertas

---

## O que foi feito

- **Epic 3:** `migrations/007_alerts.sql` (rules, alerts, latches, heartbeats)
- Histerese boolean + dedup (`cooldown` + `dedup_hour` UTC)
- Watcher avalia `range_exit`, `range_proximity`, `data_gap`; Telegram dry-run sem token
- Scripts: `pnpm watcher`, `pnpm watcher:once`
- ADR: `2026-09-15_watcher-alerts.md`
- Testes: 54 passing

---

## Estado

```
Funcionando:     indexer, analyzer snapshots, watcher alerts
Em progresso:    soak swaps 30d (RPC); soak alertas 7d zero-dup
Bloqueado:       nada crítico
Próximo epic:    Epic 4 — edge_ratio, markout, regime
```

---

## Próximos passos

1. Continuar soak swaps + deixar `watcher` rodando 7d (critério zero duplicados)
2. Epic 4: métricas derivadas / edge_ratio / markout
3. Configurar `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` quando for live

---

## Comandos

```bash
pnpm db:migrate
pnpm test
pnpm watcher:once
pnpm watcher   # loop; WATCHER_INTERVAL_MS=30000
# TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... pnpm watcher
```
