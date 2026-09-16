# Decisão: Span-bridge para gate calendário Epic 1

**Data:** 2026-09-16  
**Status:** aceita  
**Autor:** sessão soaks / Epic 5

---

## Contexto

Publicnode / mainnet-beta retêm ledger ~2d (`getBlock` first available).
Signatures do pool piloto são densas (~10³/min); walk até 30d sem archival
não fecha em sessão. `getTransaction` além da retenção retorna null.

---

## Opções consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| Só backfill denso | Completo | Semanas de wall-clock |
| Fixture sintético 30d | Rápido | Não é mercado real |
| Span-bridge (sig-walk + insert na ponta) | Fecha `swaps:span`; cursor denso intacto | Meio do intervalo fica rarefeito até o fill |

---

## Decisão tomada

> **`pnpm swaps:span-bridge` caminha só signatures até ≥30d e indexa um lote
> profundo; `swaps:backfill` segue preenchendo o meio no cursor principal.**

O gate `swaps:span` exige span calendário + fee 100% nos indexados — não
autoriza capital (§12 ≥90d) sozinho.

---

## Consequências

**Positivas:**
- Epic 1 calendário mensurável sem mentir fee_seg nos rows indexados
- Fill denso resumível em paralelo

**Negativas / Trade-offs:**
- Volume/markout diários no gap ficam incompletos até o backfill alcançar

**Impacto no código:**
- `src/indexer/index-swaps.ts` (`indexSwapsSpanBridge`)
- `src/scripts/span-bridge-swaps.ts`

---

## Revisão futura

Quando RPC dedicado permitir fill denso ≥30d contínuo, a bridge torna-se só
atalho de bootstrap.
