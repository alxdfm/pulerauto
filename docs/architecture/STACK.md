# Stack & Arquitetura

> Atualizado: 2026-09-16 (Epics 0–4).

---

## Runtime & Linguagem

```
Linguagem principal:  TypeScript 5.9
Runtime:              Node >= 22 (dev: 24.x)
Package manager:      pnpm 11
```

## Frontend (se aplicável)

```
Framework:      N/A (Fases 0–4; UI depois)
Estilização:    N/A
State:          N/A
```

## Backend (se aplicável)

```
Framework:      processos long-running (indexer, analyzer, watcher, executor);
                API HTTP depois
ORM / DB:       PostgreSQL 16 + TimescaleDB; migrations SQL em migrations/
                client: pg
Auth:           nenhum por ora
```

## Infra & Deploy

```
Hosting:        local (docker compose)
CI/CD:          indefinido
Monitoramento:  watcher heartbeat + Telegram (dry-run local)
```

## Blockchain / Web3 (se aplicável)

```
Chain:          Solana mainnet (leitura)
SDK principal:  @solana/web3.js 1.x + decoder manual Whirlpool
                (pool, FixedTickArray, DynamicTickArray, Position,
                 evento Traded)
Wallet:         N/A (read-only; executor = Fase 7)
Ambiente:       mainnet (read-only)
Pool piloto:    Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE (Orca SOL/USDC ts=4)
RPC tip:        mainnet-beta ok p/ getProgramAccounts;
                publicnode ajuda backfill de swaps (batch getTransaction=1)
```

---

## Versões fixadas (crítico)

| Pacote | Versão | Motivo de fixar |
|--------|--------|-----------------|
| @solana/web3.js | 1.x | Decoder alinhado ao layout atual; kit v2 depois |

Tick arrays: FixedTickArray (9988) + DynamicTickArray (148–10004); ver ADR `2026-09-15_dynamic-tick-array.md`.  
Swaps: evento `Traded` via logs; ver ADR `2026-09-15_whirlpool-traded-ingest.md`.  
Position: account 216 B + PDA `["position", mint]`; ver ADR `2026-09-15_whirlpool-position-decode.md`.  
Fee state / entry: checkpoints + entry_* no open; ver ADR `2026-09-15_position-fee-entry.md`.  
Alerts: `dedup_hour` UTC + Telegram dry-run; ver ADR `2026-09-15_watcher-alerts.md`.  
Latch: FIRED após emit + `episode_fired`; ver ADR `2026-09-15_watcher-latch-after-emit.md`.  
Sinal: amostragem σ / Vol; ver ADR `2026-09-15_epic4-sigma-sampling.md`.

---

## Padrões de arquitetura

```
Padrão geral:     modular monolith por processo
Separação:        math / db / indexer / analyzer / watcher / scripts
Testes:           Vitest (math + invariantes DB + fixtures ticks/positions/markout + watcher)
```

| Processo | Privilegio | Papel |
|----------|------------|--------|
| indexer  | read RPC + write DB | pool_states, ticks, swaps, swap_segments, positions |
| analyzer | read DB + write métricas | position_snapshots; pool_metrics_daily (edge/markout/regime) |
| watcher  | read DB + write alerts | histerese, dedup, heartbeat → Telegram |
| executor | signer isolado | Fase 7 |

---

## O que NÃO usar neste projeto

- Não usar `number`/`float` para estado on-chain, fee growth, L ou P&L canônico
- Não anualizar LVR/fee_APR sem condicionar a tempo em range
- Não tratar swap como pontual em tick_after
- Não pular para execução antes das fases de contabilidade e sinal
