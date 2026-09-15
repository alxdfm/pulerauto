# Decisão: checkpoint on-chain com gap conhecido na reconstrução de L

**Data:** 2026-09-15  
**Status:** fechada  
**Autor:** Epic 0.D

---

## Contexto

O critério da Fase 0 exige `L_ativa` reconstruída **exatamente** igual a `pool_states.liquidity`. Com getProgramAccounts só de FixedTickArray (`dataSize=9988`), a reconstrução ficava a um delta constante `39153215` e `sum(net) ≠ 0`.

---

## Opções consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| Bloquear Fase 0 até delta=0 | Fidelidade à spec | Paralisa progresso (swaps/P&L) |
| Checkpoint sintético só para CI | Invariantes verdes | Não prova indexer real |
| Indexar ticks on-chain + registrar gap | Dados reais; teste sintético cobre pipeline | Critério exato ainda aberto |

---

## Decisão tomada (temporária, 2026-09-15)

> **Seguir com ticks on-chain via gPA; manter teste sintético para o pipeline de invariantes; tratar delta exato como bug aberto 0.D.**

---

## Resolução

Causa raiz: o pool piloto também tem **DynamicTickArray** (whirlpool @ offset 12; tamanho variável 148–10004). O filtro `dataSize=9988` ignorava ~137 arrays; nets incompletos → `sumNet ≠ 0` e L errada.

Correção: decoder Borsh de DynamicTick (`Uninitialized` | `Initialized`) + gPA dual (fixed + dynamic); gate de consistência = `sumNet === 0` e `L` exata. Fixture offline em `fixtures/orca-sol-usdc-tick-snapshot.json`.

---

## Consequências

**Positivas:** invariantes 1–3 passam no path on-chain; WARN removido do indexer.

**Impacto:** `src/indexer/dynamic-tick-array.ts`, `src/indexer/fetch-whirlpool-ticks.ts`.
