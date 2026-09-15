# Decisão: ingest de swaps via evento Traded (Whirlpool)

**Data:** 2026-09-15  
**Status:** aceita  
**Autor:** Epic 1

---

## Contexto

Epic 1 exige `swaps` + `swap_segments` com `Σ fee_seg = fee_amount`. O evento Anchor `Traded` expõe amounts, sqrt before/after e `lp_fee`, mas não traz `tick_*` nem `liquidity_before`.

---

## Opções consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| `@orca-so/whirlpools-sdk` parse | Pronto | Dep pesada; ADR decoder manual |
| Logs `Program data:` + decode Borsh | Leve; alinhado ao web3.js v1 | Precisa raw RPC `maxSupportedTransactionVersion` |
| Só indexar fee growth | Simples | Não atende segmentação multi-tick (spec §5) |

---

## Decisão tomada

> **Decode manual do evento `Traded` a partir de logs; ticks via `tickFromSqrtPriceX64`; L via checkpoint/events as-of; fees com `allocateFeeSegments`.**

Backfill/poll com `getSignaturesForAddress` + cursor em `indexer_cursors`. Segmentação em `src/math/swap-segments.ts`.

---

## Consequências

**Positivas:** invariante 5 testável; sem SDK Orca; retomada de backfill.

**Negativas / Trade-offs:** soak 30d de mercado exige RPC com quota; L histórica depende de checkpoints/events no DB.

**Impacto:** `src/indexer/traded-event.ts`, `index-swaps.ts`, `persist-swap.ts`, `tick-nets.ts`, `rpc-tx.ts`, `migrations/005_indexer_cursors.sql`

---

## Revisão futura

Quando `tick_liquidity_events` forem indexados de forma contínua, revalidar L_seg em swaps antigos. Revisitar decoder se Orca mudar o layout de `Traded`.
