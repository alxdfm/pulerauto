# Decisão: Persistir fee growth + entry_* só no open real

**Data:** 2026-09-15  
**Status:** aceita  
**Autor:** sessão qualidade Epic 2

---

## Contexto

Snapshots DB calculavam `fees_pending_usd` sem `feeGrowthOutside` nem checkpoints da Position. `positions:index` gravava `entry_*` com mark live e podia duplicar eventos `mint`.

---

## Opções consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| RPC a cada snapshot | Sem migration | Analyzer deixa de ser DB-only |
| Persistir outside + checkpoint | Offline confiável | Migration + backfill de ticks |
| Mark live como entry | UX fácil | P&L mentiroso |

---

## Decisão tomada

> **Persistir `fee_growth_checkpoint*` em `positions` e `fee_growth_outside*` em `tick_liquidity_checkpoints`; exigir entry_* explícito na primeira indexação; mint idempotente por `(position_id, kind, tx_ref)`; `nft_mint NOT NULL`.**

---

## Consequências

**Positivas:**
- Pending fees e collects em USD usam math correta
- Re-index não corrompe entry nem duplica mint

**Negativas / Trade-offs:**
- CLI de index exige flags de entry na criação
- Checkpoints antigos sem outside ficam 0 até re-index de ticks

**Impacto no código:**
- `migrations/008_position_fee_state.sql`, `position-snapshot.ts`, `index-position.ts`, `persist-position.ts`, `index-pool.ts`

---

## Revisão futura

Quando houver histórico completo de mint tx decode automático de amounts.
