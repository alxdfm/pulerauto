# Decisão: Reality Check + orçamento de params no Epic 5

**Data:** 2026-09-16  
**Status:** aceita  
**Autor:** sessão Epic 5

---

## Contexto

Epic 5 exige walk-forward OOS com fees reconstruídas e Reality Check p < 0.05
(spec §12). Sem `n_trials` e correção de testes múltiplos, qualquer busca de
params produz falso positivo.

---

## Opções consideradas

| Opção | Prós | Contras |
|-------|------|---------|
| p-value ingênuo na melhor trial | Simples | Overfit garantido |
| White Reality Check / bootstrap max sob H0 | Spec §12; corrige snooping | Mais código |
| Bonferroni fixo | Fácil | Conservador demais / não espelha White |

---

## Decisão tomada

> **Bootstrap max-under-null approximation of White's Reality Check; ≤3 params
> livres (`rangeRatio` variants on train); `n_trials` = tamanho real da busca;
> OOS só com `fee_source = reconstructed_segments` (CHECK SQL). Sem folds
> train/test, o runner recusa gravar OOS.**

Params livres do piloto (busca no train): `rangeRatio` ∈ {0.95×, 1×, 1.05×} do
`range_width_pct` da Strategy. `jit_factor` default = 1 em Solana até medição.

Implementação: `realityCheckPValue` recente excessos da série selecionada e
compara o máximo observado (ou `trialMeans`) ao bootstrap do máximo sob H0.
Não persiste a superfície completa White (2000); revisit se n_trials crescer.

---

## Consequências

**Positivas:**
- Gate OOS alinhado à spec; DB impede modeled+OOS
- Superfície de busca limitada (≤3)

**Negativas / Trade-offs:**
- Done capital (§12 ≥90d / 3 regimes) pode atrasar vs gate Epic 1 (30d)

**Impacto no código:**
- `src/math/reality-check.ts` (bootstrap max-under-null + `trialMeans`)
- `src/analyzer/backtest-run.ts` (busca ≤3 `rangeRatio` no train; recusa OOS sem folds)
- `migrations/012_backtest_runs.sql`

---

## Revisão futura

Quando houver medição de `jit_factor` on-chain; revisit após ≥90d de swaps.
