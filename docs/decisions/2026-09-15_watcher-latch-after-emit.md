# Decisão: Latch FIRED só após emit + episode_fired explícito

**Data:** 2026-09-15  
**Status:** aceita  
**Autor:** sessão qualidade Epic 3

---

## Contexto

O watcher gravava latch FIRED (sentinel `since_at = epoch`) antes de `emitAlert`. Dedup/cooldown reject silenciava o episódio. Telegram falhava sem status.

---

## Opções consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| Manter sentinel epoch | Sem migration | Frágil e opaco |
| FIRED após emit + `episode_fired` | Correto | Migration |
| Outbox Redis | Robusto | Overkill no draft |

---

## Decisão tomada

> **`episode_fired` boolean; persistir FIRED só após emit ok; `delivery_status` em alerts; um checkout de client por ciclo.**

---

## Consequências

**Positivas:**
- Episódio permanece armado se dedup rejeitar e pode emitir depois
- Falha Telegram visível (`failed` vs `dry_run`/`delivered`)

**Negativas / Trade-offs:**
- Dispatch de canais ainda é síncrono no ciclo

**Impacto no código:**
- `migrations/009_alert_latch_fired.sql`, `hysteresis.ts`, `evaluate.ts`, `persist-alert.ts`

---

## Revisão futura

Fila dedicada / retry de delivery quando houver multi-canal produtivo.
