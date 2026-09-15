# Decisão: Amostragem de sigma_30d e Vol_anual no Epic 4

**Data:** 2026-09-15  
**Status:** aceita  
**Autor:** sessão Epic 4

---

## Contexto

`pool_metrics_daily` precisa de `sigma_30d`, `SigmaImplied` e `er_q80_90d` com histórico ainda em soak.

---

## Opções consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| Exigir 90d antes de métricas | Rigoroso | Bloqueia piloto |
| Janela disponível ≤90d + Vol do dia ×365 | Ranking cedo | σ/ER menos estáveis |
| Vol EWMA multi-dia | Mais suave | Complexidade extra |

---

## Decisão tomada

> **sigma_30d = vol anualizada dos log-returns diários do ratio (até 31 dias); Vol_anual = volume_usd do dia × 365; er_q80 sobre ER históricos disponíveis (coluna `er_q80_90d`).**

---

## Consequências

**Positivas:**
- Ranking reproduzível assim que há swaps + pool_states
- Alinhado ao exemplo §4 quando inputs batem

**Negativas / Trade-offs:**
- Com span curto, sigma/ER são provisórios até soak 30d/90d

**Impacto no código:**
- `src/math/sigma-*.ts`, `regime.ts`, `analyzer/pool-metrics-daily.ts`

---

## Revisão futura

Quando span ≥90d, recalibrar e documentar estabilidade do quantile.
