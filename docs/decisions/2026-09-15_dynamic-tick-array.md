# Decisão: indexar FixedTickArray + DynamicTickArray

**Data:** 2026-09-15  
**Status:** aceita  
**Autor:** Epic 0.D

---

## Contexto

Orca introduziu DynamicTickArray (conta variável). O indexer só lia FixedTickArray (`9988` bytes), omitindo liquidez do pool piloto SOL/USDC.

---

## Opções consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| Só FixedTickArray | Simples | L nunca reconstrói em pools com dynamic |
| `@orca-so/whirlpools-sdk` | Decode pronto | Dep pesada (ADR decoder manual) |
| Decoder manual dual | Alinhado ao ADR web3.js | Manutenção de dois layouts |

---

## Decisão tomada

> **Decoder manual de FixedTickArray + DynamicTickArray; gPA dual; sem SDK Orca em runtime.**

Dynamic: discriminator `[17,216,246,142,225,199,218,56]`, header `start_tick_index` + `whirlpool` @12 + `tick_bitmap`, depois 88 enums Borsh (1 byte ou 113 bytes).

---

## Consequências

**Positivas:** `sumNet=0` e L exata no pool piloto.

**Negativas:** dois paths de decode a manter se Orca mudar layout.

**Impacto:** `src/indexer/dynamic-tick-array.ts`, `src/indexer/fetch-whirlpool-ticks.ts`.
