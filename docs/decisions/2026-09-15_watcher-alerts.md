# Decisão: Watcher com Telegram dry-run e latch de histerese

**Data:** 2026-09-15  
**Status:** aceita  
**Autor:** sessão Epic 3

---

## Contexto

Epic 3 exige alertas com histerese, dedup horário (§18) e liveness (§19). Telegram é o canal default; em dev não há bot token.

---

## Opções consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| Sempre exigir Telegram | Força config | Bloqueia testes locais |
| Dry-run log se token ausente | CI/local funciona | Fácil esquecer de configurar em prod |
| Fila externa (Redis) | Casa com "DB ro + fila" da spec | Overkill no draft |

---

## Decisão tomada

> **Dry-run por omissão** (`TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` ausentes → log). Dedup = `cooldown_sec` + unique `(rule_id, dedup_key, dedup_hour)` com `dedup_hour` UTC preenchido pelo writer (Postgres rejeita `date_trunc` em `timestamptz` no índice unique). Histerese via `alert_rule_latches`. Heartbeat em `watcher_heartbeats`.

---

## Consequências

**Positivas:**
- Zero duplicados na mesma hora para a mesma chave
- Watcher testável sem rede

**Negativas / Trade-offs:**
- Watcher escreve `alerts` / latches / heartbeats (não DB puramente ro)
- PositionBundle events ainda não decodificados; kinds edge/markout **wired** em 2026-09-16 via `pool_metrics_daily`
- Ordem latch FIRED vs emit foi corrigida depois — ver `2026-09-15_watcher-latch-after-emit.md`

**Impacto no código:**
- `migrations/007_alerts.sql`, `src/watcher/*`

---

## Revisão futura

Quando houver fila dedicada ou quórum de RPC (§19) antes de disparar `action`/`critical`.
