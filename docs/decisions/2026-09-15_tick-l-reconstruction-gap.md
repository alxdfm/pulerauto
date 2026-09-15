# Decisão: checkpoint on-chain com gap conhecido na reconstrução de L

**Data:** 2026-09-15  
**Status:** aceita (temporária)  
**Autor:** Epic 0.D

---

## Contexto

O critério da Fase 0 exige `L_ativa` reconstruída **exatamente** igual a `pool_states.liquidity`. Com getProgramAccounts de todos os TickArrays (~225) do pool SOL/USDC, a reconstrução fica a um delta constante `39153215` (~6e-8 relativo) e `sum(net) ≠ 0` (~-1.4e10).

---

## Opções consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| Bloquear Fase 0 até delta=0 | Fidelidade à spec | Paralisa progresso (swaps/P&L) |
| Checkpoint sintético só para CI | Invariantes verdes | Não prova indexer real |
| Indexar ticks on-chain + registrar gap | Dados reais; teste sintético cobre pipeline | Critério exato ainda aberto |

---

## Decisão tomada

> **Seguir com ticks on-chain via gPA; manter teste sintético para o pipeline de invariantes; tratar delta exato como bug aberto 0.D.**

Hipóteses: layout/edge case no decode, inconsistência de slot entre contas, ou regra de cruzamento de tick. Investigar com SDK Orca ou fixture de slot único.

---

## Consequências

**Positivas:** indexer live de `pool_states` + ticks reais no DB.

**Negativas:** Fase 0 não está “done” pelo critério literal da spec.

**Impacto:** `src/indexer/tick-array.ts`, WORKPLAN Epic 0.

---

## Revisão futura

Assim que `reconstructed === liquidity` e `sumNet === 0` em slot consistente — fechar 0.D e remover esta decisão temporária.
