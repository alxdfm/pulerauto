# Decisão: TypeScript como linguagem principal

**Data:** 2026-09-15  
**Status:** aceita  
**Autor:** setup inicial Pulerauto

---

## Contexto

O projeto começa só com a especificação técnica (LP Assistant v2). Era preciso fixar linguagem/runtime antes do plano de trabalho e do código da Fase 0 (schema + indexer Orca SOL/USDC). Há pressão por iteração rápida em math/indexer e ecossistema Solana maduro em JS/TS.

---

## Opções consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| TypeScript + Node 22 | Ecossistema Solana/Orca, Vitest, um time/stack; bom para advisory + indexer | Precisão exige disciplina (`bigint`/decimal); hot path pode ser mais lento |
| Rust | Performance e tipos fortes para math/indexer | Mais lento para iterar schema/métricas; SDKs Solana ok mas curva maior |
| Python | Prototipar math/backtest rápido | Tipagem e processos long-running menos ideais para indexer + executor |

---

## Decisão tomada

> **TypeScript 5.x + Node 22 + pnpm**

Alinha com a velocidade desejada nas Fases 0–4 e com SDKs Solana. Precisão on-chain fica sob regra explícita em STACK/CODE_STYLE (`NUMERIC` / `bigint`). Rust fica como opção futura só se profiling mostrar hot path inaceitável.

---

## Consequências

**Positivas:**
- Uma linguagem para math unitário, indexer e (depois) API
- Vitest para invariantes numéricos da spec

**Negativas / Trade-offs:**
- Risco de uso acidental de `number` — mitigado por glossário/guardrails e reviews
- Possível rewrite parcial de hot path em Rust no futuro

**Impacto no código:**
- Na data da decisão ainda não havia `src/`; hoje: `src/math/`, `src/db/`, `src/indexer/` (STACK.md)

---

## Revisão futura

Revisitar se o indexer não sustentar throughput de multi-pool / multi-chain (Fase 6) após profiling — aí avaliar módulo Rust para reconstrução de ticks ou fee segments.
