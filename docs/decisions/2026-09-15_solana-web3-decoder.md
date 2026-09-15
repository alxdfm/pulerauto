# Decisão: @solana/web3.js v1 + decoder manual Whirlpool

**Data:** 2026-09-15  
**Status:** aceita  
**Autor:** Epic 0.A / 0.D

---

## Contexto

Precisávamos ler estado on-chain do Orca Whirlpool (SOL/USDC) na Fase 0 sem amarrar cedo a um SDK monolítico.

---

## Opções consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| `@solana/web3.js` v1 + decode manual | Controle, deps leves, testável | Layout precisa manutenção |
| `@orca-so/whirlpools-sdk` | Tick arrays prontos | Mais pesado; API muda |
| `@solana/kit` (web3.js v2) | Moderno | Ecossistema Orca ainda misto |

---

## Decisão tomada

> **`@solana/web3.js` 1.x + `decodeWhirlpool` local**

Snapshot de `pool_states` na Fase 0. Tick arrays on-chain completos ficam como follow-up de 0.D (hoje checkpoint sintético consistente valida o pipeline de invariantes).

---

## Consequências

**Positivas:** bootstrap rápido; invariantes testáveis sem SDK.

**Negativas / Trade-offs:** decoder pode quebrar se Orca mudar layout; tick arrays reais ainda não indexados.

**Impacto no código:** `src/indexer/whirlpool-decode.ts`, `src/indexer/index-pool.ts`

---

## Revisão futura

Tick arrays Fixed + Dynamic indexados (ADR `2026-09-15_dynamic-tick-array.md`). Manter decoder manual; SDK Orca só se layout mudar de forma recorrente.
